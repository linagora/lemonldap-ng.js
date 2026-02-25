# Test library for LemonLDAP-NG JS implementation
# This is an adapted version that starts a Node.js server instead of Perl portal

package main;

=pod

=encoding utf8

=head1 NAME

test-lib.pm - Test framework for LLNG JS implementation

=head1 SYNOPSIS

  use Test::More;
  use strict;
  use IO::String;

  require 't/test-lib.pm';

  my $res;

  my $client = LLNG::Manager::Test->new( {
      ini => {
          logLevel => 'error',
          #...
      }
    }
  );

  ok(
      $res = $client->_post(
          '/',
          IO::String->new('user=dwho&password=dwho'),
          length => 23
      ),
      'Auth query'
  );
  count(1);
  expectOK($res);
  my $id = expectCookie($res);

  clean_sessions();
  done_testing( count() );

=head1 DESCRIPTION

This test library tests the JavaScript implementation of LemonLDAP-NG
by starting a Node.js server and making HTTP requests to it.

=cut

use strict;
use Data::Dumper;
use File::Find;
use JSON;
use LWP::UserAgent;
use HTTP::Request;
use URI::Escape;
use MIME::Base64;
use File::Temp 'tempfile', 'tempdir';
use File::Copy 'copy';
use File::Path qw(make_path remove_tree);
use File::Basename qw(dirname);
use POSIX ":sys_wait_h";
use Carp qw/shortmess/;

# Try to load XML::LibXML for HTML parsing (optional)
my $hasXmlLibXML = eval { require XML::LibXML; 1 };

# Load LLNG Perl modules for helpers (from PERL5LIB)
eval { require Lemonldap::NG::Common::FormEncode };
eval { require Lemonldap::NG::Common::Session };
eval { require Lemonldap::NG::Common::Util };

our $count = 0;
$Data::Dumper::Deparse  = 1;
$Data::Dumper::Sortkeys = 1;
$Data::Dumper::Useperl  = 1;

# Temporary directory for sessions and config
our $tmpDir = $ENV{LLNG_TMPDIR}
  || tempdir( 'tmpSessionXXXXX', DIR => 't/sessions', CLEANUP => 1 );
reset_tmpdir();

=head4 count($inc)

Returns number of tests done. Increment test number if an argument is given

=cut

sub count {
    my $c = shift;
    $count += $c if ($c);
    return $count;
}

=head4 buildForm($params)

Convenience method that builds a url-encoded query string from a hash of arguments

=cut

sub buildForm {
    my $fields = shift;
    my $query  = join( '&',
        map { "$_=" . ( defined $fields->{$_} ? uri_escape( $fields->{$_} ) : '' ) }
          keys(%$fields) );
    return $query;
}

=head4 explain( $result, $expected_result )

Used to display error if test fails

=cut

sub main::explain {
    my ( $get, $ref ) = @_;
    $get = Dumper($get) if ( ref $get );
    diag("Expect $ref, get $get\n");
}

=head4 reset_tmpdir()

Reinitialize temp directory

=cut

sub reset_tmpdir {
    find( sub { unlink if -f }, $tmpDir ) if -d $tmpDir;
    make_path("$tmpDir/lock");
    make_path("$tmpDir/saml/lock");
    copy( "t/lmConf-1.json", "$tmpDir/lmConf-1.json" ) if -f "t/lmConf-1.json";
}

=head4 clean_sessions()

Clean sessions created during tests

=cut

sub clean_sessions {
    find( sub { unlink if -f }, $tmpDir ) if -d $tmpDir;
    foreach my $dir ("$tmpDir/lock", "$tmpDir/saml/lock", "$tmpDir/saml") {
        if ( -d $dir ) {
            opendir D, $dir or die $!;
            foreach ( grep { /^[^\.]/ } readdir(D) ) {
                unlink "$dir/$_";
            }
            closedir D;
        }
    }
}

sub count_sessions {
    my ( $kind, $dir ) = @_;
    my $nbr = 0;
    $kind ||= 'SSO';
    $dir  ||= $tmpDir;

    opendir D, $dir or die $!;
    foreach ( grep { /^\w{64}$/ } readdir(D) ) {
        open( my $fh, '<', "$dir/$_" ) or die($!);
        while (<$fh>) {
            chomp;
            if ( $_ =~ /"_session_kind":"$kind"/ ) {
                $nbr++;
                last;
            }
        }
        close $fh;
    }
    closedir D;
    $nbr;
}

sub getSession {
    my $id = shift;
    my $file = "$tmpDir/$id";
    return undef unless -f $file;
    open( my $fh, '<', $file ) or return undef;
    local $/;
    my $content = <$fh>;
    close $fh;
    return JSON::from_json($content);
}

=head4 expectRedirection( $res, $location )

Verify that request result is a redirection to $location.

=cut

sub expectRedirection {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $location ) = @_;
    ok( $res->[0] == 302, ' Get redirection' )
      or explain( $res->[0], 302 );
    count(1);
    if ( ref $location ) {
        my @match;
        @match = ( getRedirection($res) =~ $location );
        ok( @match, ' Location header found' )
          or explain( $res->[1], "Location match: " . Dumper($location) );
        count(1);
        return @match;
    }
    else {
        is( getRedirection($res), $location, " Location is $location" );
        count(1);
    }
}

=head4 expectForm( $res, $hostRe, $uriRe, @requiredFields )

Verify form in HTML result and return ( $host, $uri, $query, $method )

=cut

sub expectForm {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $hostRe, $uriRe, @requiredFields ) = @_;
    expectOK($res);
    count(1);
    if (
        ok(
            $res->[2]->[0] =~
m@<form.+?action="(?:(?:https?://([^/]+))?(/.*?)?|(#))".+method="(post|get)"@is,
            ' Page contains a form'
        )
      )
    {
        my ( $host, $uri, $hash, $method ) = ( $1, $2, $3, $4 );
        if ( $hash and $hash eq '#' ) {
            $host = '#';
            $uri  = '';
        }
        if ($hostRe) {
            if ( ref $hostRe ) {
                ok( $host =~ $hostRe, ' Host match' )
                  or explain( $host, $hostRe );
            }
            else {
                ok( $host eq $hostRe, ' Host match' )
                  or explain( $host, $hostRe );
            }
            count(1);
        }
        if ($uriRe) {
            if ( ref $uriRe ) {
                ok( $uri =~ $uriRe, ' URI match' ) or explain( $uri, $uriRe );
            }
            else {
                ok( $uri eq $uriRe, ' URI match' ) or explain( $uri, $uriRe );
            }
            count(1);
        }

        # Fields with values
        my %fields =
          ( $res->[2]->[0] =~
              m#<input.+?name="([^"]+)"[^>]+(?:value="([^"]*?)")#gs );

        # Add fields without values
        %fields = (
            $res->[2]->[0] =~
              m#<input.+?name="([^"]+)"[^>]+(?:value="([^"]*?)")?#gs,
            %fields
        );

        # Add textarea
        %fields = (
            $res->[2]->[0] =~
              m#<textarea.+?name="([^"]+)"[^>]+(?:value="([^"]*?)")?#gs,
            %fields
        );
        my $query = buildForm( \%fields );
        foreach my $f (@requiredFields) {
            ok( exists $fields{$f}, qq{ Field "$f" is defined} );
            count(1);
        }
        return ( $host, $uri, $query, $method );
    }
    else {
        return ();
    }
}

=head4 expectAuthenticatedAs($res, $user)

Verify that result has a C<Lm-Remote-User> header and value is $user

=cut

sub expectAuthenticatedAs {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $user ) = @_;
    is( getHeader( $res, 'Lm-Remote-User' ), $user, "Authenticated as $user" );
    count(1);
}

=head4 expectOK($res)

Verify that returned code is 200

=cut

sub expectOK {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ($res) = @_;
    ok( $res->[0] == 200, ' HTTP code is 200' ) or explain( $res, 200 );
    count(1);
}

=head4 expectJSON($res)

Verify that the HTTP response contains valid JSON and returns the corresponding object

=cut

sub expectJSON {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ($res) = @_;
    is( $res->[0], 200, ' HTTP code is 200' ) or explain( $res, 200 );
    my %hdr = @{ $res->[1] };
    like( $hdr{'Content-Type'}, qr,^application/json,i,
        ' Content-Type is JSON' )
      or explain($res);
    my $json;
    eval { $json = JSON::from_json( $res->[2]->[0] ) };
    ok( not($@), 'Content is valid JSON' );
    count(3);
    return $json;
}

=head4 expectForbidden($res)

Verify that returned code is 403.

=cut

sub expectForbidden {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ($res) = @_;
    ok( $res->[0] == 403, ' HTTP code is 403' ) or explain( $res->[0], 403 );
    count(1);
}

=head4 expectBadRequest($res)

Verify that returned code is 400.

=cut

sub expectBadRequest {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ($res) = @_;
    ok( $res->[0] == 400, ' HTTP code is 400' ) or explain( $res->[0], 400 );
    count(1);
}

=head4 expectPortalError( $res, $errnum )

Verify that an error is displayed on the portal

=cut

sub expectPortalError {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $errnum, $message ) = @_;
    $errnum  ||= 9;
    $message ||= "Expected portal error code";
    my ($error) = $res->[2]->[0] =~ qr/<span trmsg="(\d+)">/;
    ok( $error, "$message: code found on page" ) or explain $res->[2]->[0];
    is( $error, $errnum, $message );
    count(2);
}

=head4 expectReject( $res, $status, $code )

Verify that returned code is 401 (or $status) and JSON result contains error code

=cut

sub expectReject {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $status, $code ) = @_;
    $status ||= 401;
    cmp_ok( $res->[0], '==', $status, " Response status is $status" );
    eval { $res = JSON::from_json( $res->[2]->[0] ) };
    ok( not($@), ' Content is JSON' )
      or explain( $res->[2]->[0], 'JSON content' );
    if ( defined $code ) {
        is( $res->{error}, $code, " Error code is $code" )
          or explain( $res->[0], $code );
    }
    else {
        pass("Error code is $res->{error}");
    }
    count(3);
}

=head4 expectCookie( $res, $cookieName )

Check if a C<Set-Cookie> exists and set a cookie named $cookieName. Return its value.

=cut

sub expectCookie {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $cookieName ) = @_;
    $cookieName ||= 'lemonldap';
    my $cookies = getCookies($res);
    my $id;
    ok(
        defined( $id = $cookies->{$cookieName} ),
        " Get cookie $cookieName ($id)"
    ) or explain( $res->[1], "Set-Cookie: $cookieName=something" );
    count(1);
    return $id;
}

=head4 expectPdata( $res );

Check if the pdata cookie exists and returns its deserialized value.

=cut

sub expectPdata {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ($res) = @_;
    my $val = expectCookie( $res, "lemonldappdata" );
    ok( $val, "Pdata is not empty" );
    count(1);
    my $pdata;
    eval { $pdata = JSON::from_json( uri_unescape($val) ); };
    diag($@) if $@;
    return $pdata;
}

=head4 getCookies($res)

Returns an hash ref with names => values of cookies set by server.

=cut

sub getCookies {
    my ($resp) = @_;
    my @hdrs   = @{ $resp->[1] };
    my $res    = {};
    while ( my $name = shift @hdrs ) {
        my $v = shift @hdrs;
        if ( $name eq 'Set-Cookie' ) {
            if ( $v =~ /^(\w+)=([^;]*)/ ) {
                $res->{$1} = $2;
            }
        }
    }
    return $res;
}

=head4 getHeader( $res, $hname )

Returns value of first header named $hname in $res response.

=cut

sub getHeader {
    my ( $resp, $hname ) = @_;
    my @hdrs = @{ $resp->[1] };
    while ( my $name = shift @hdrs ) {
        my $v = shift @hdrs;
        if ( lc($name) eq lc($hname) ) {
            return $v;
        }
    }
    return undef;
}

=head4 getRedirection($res)

Returns value of C<Location> header.

=cut

sub getRedirection {
    my ($resp) = @_;
    return getHeader( $resp, 'Location' );
}

=head4 getUser($res)

Returns value of C<Lm-Remote-User> header.

=cut

sub getUser {
    my ($resp) = @_;
    return getHeader( $resp, 'Lm-Remote-User' );
}

=head4 tempdb

Return a temporary file named XXXX.db

=cut

sub tempdb {
    my $filename = shift // "userdb.db";
    return "$tmpDir/$filename";
}

=head4 encodeUrl( $url );

Encode URL like the handler would

=cut

sub encodeUrl {
    my ($url) = @_;
    return encode_base64( $url, '' );
}

# Placeholder for HTML parsing (requires XML::LibXML)
sub getHtmlElement {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $xpath ) = @_;

    ok( $res->[2]->[0], "Response body is not empty" );
    count(1);

    if ($hasXmlLibXML) {
        my $doc = XML::LibXML->new->load_html( string => $res->[2]->[0], recover => 2 );
        return $doc->findnodes($xpath);
    }
    else {
        diag("XML::LibXML not available, skipping XPath query");
        return;
    }
}

sub expectXpath {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $res, $xpath, $message ) = @_;
    $message ||= "Found at least one result for $xpath";

    ok( $res = getHtmlElement( $res, $xpath ), $message );
    count(1);
    return $res;
}

sub getJsVars {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ($res) = @_;

    return {} unless $hasXmlLibXML;

    my $initscripts = getHtmlElement( $res, '//script[@type="application/init"]' );
    return {} unless $initscripts;

    my @parsed_initscripts = map { JSON::from_json( $_->string_value ) } $initscripts->get_nodelist();
    my %vars = map { %$_ } @parsed_initscripts;
    return \%vars;
}

# Placeholders for multi-handler tests (not supported in JS version yet)
sub register { die "register() not supported in JS test harness" }
sub withHandler { die "withHandler() not supported in JS test harness" }
sub pushHandler { die "pushHandler() not supported in JS test harness" }
sub popHandler { die "popHandler() not supported in JS test harness" }
sub switch { die "switch() not supported in JS test harness" }


=head2 LLNG::Manager::Test Class

This class manages the Node.js test server and provides HTTP methods.

=cut

package LLNG::Manager::Test;

use strict;
use Mouse;
use LWP::UserAgent;
use HTTP::Request;
use JSON;
use POSIX ":sys_wait_h";
use IO::Socket::INET;
use File::Spec;
use File::Basename qw(dirname);

# Server process management
has jsServerPid => ( is => 'rw' );
has serverPort  => ( is => 'rw', default => sub { 19876 + int(rand(1000)) } );
has serverUrl   => ( is => 'rw' );
has ua          => ( is => 'rw', lazy => 1, builder => '_build_ua' );

# Request defaults
has accept => ( is => 'rw', default => 'application/json, text/plain, */*' );

# Configuration
has ini => (
    is      => 'rw',
    trigger => \&_init_and_start,
);

our $defaultIni = {
    configStorage => {
        type    => 'File',
        dirName => $main::tmpDir,
    },
    logLevel     => 'warn',
    cookieName   => 'lemonldap',
    domain       => 'example.com',
    portal       => 'http://auth.example.com/',
    securedCookie => 0,
    https        => 0,
    globalStorage => 'Apache::Session::File',
    globalStorageOptions => {
        Directory     => $main::tmpDir,
        LockDirectory => "$main::tmpDir/lock",
    },
};

sub _build_ua {
    my $self = shift;
    my $ua = LWP::UserAgent->new( timeout => 30 );
    # Don't follow redirects automatically, we need to test them
    $ua->max_redirect(0);
    return $ua;
}

sub _init_and_start {
    my ( $self, $ini ) = @_;

    # Merge with defaults
    foreach my $k ( keys %$defaultIni ) {
        $ini->{$k} //= $defaultIni->{$k};
    }

    # Override tmpDir paths
    $ini->{configStorage}{dirName} = $main::tmpDir;
    $ini->{globalStorageOptions}{Directory} = $main::tmpDir;
    $ini->{globalStorageOptions}{LockDirectory} = "$main::tmpDir/lock";

    $self->{ini} = $ini;

    # Write configuration file
    $self->writeJsConfig($ini);

    # Write lemonldap-ng.ini
    $self->writeIniFile();

    # Start the Node.js server
    $self->startJsServer();

    $self;
}

sub writeJsConfig {
    my ( $self, $ini ) = @_;

    # Create the config that the JS handler expects
    my $config = {
        cfgNum   => 1,
        cfgDate  => time(),
        cfgAuthor => 'test-lib.pm',

        # Authentication settings
        authentication => $ini->{authentication} || 'Demo',
        userDB         => $ini->{userDB} || 'Same',
        passwordDB     => $ini->{passwordDB} || 'Null',

        # Cookie and domain
        cookieName    => $ini->{cookieName} || 'lemonldap',
        domain        => $ini->{domain} || 'example.com',
        portal        => $ini->{portal} || 'http://auth.example.com/',
        securedCookie => $ini->{securedCookie} || 0,
        https         => $ini->{https} || 0,

        # Session storage (JS uses session-file)
        globalStorage        => 'Apache::Session::File',
        globalStorageOptions => {
            Directory     => $main::tmpDir,
            LockDirectory => "$main::tmpDir/lock",
        },

        # Location rules and headers
        locationRules   => $ini->{locationRules} || {
            'auth.example.com' => { default => 'accept' },
            'test1.example.com' => {
                '^/logout' => 'logout_sso',
                '^/deny'   => 'deny',
                'default'  => 'accept',
            },
            'test2.example.com' => {
                '^/logout' => 'logout_sso',
                'default'  => 'accept',
            },
            '*.example.llng' => { default => 'accept' },
        },
        exportedHeaders => $ini->{exportedHeaders} || {
            'test1.example.com' => { 'Auth-User' => '$uid' },
            'test2.example.com' => { 'Auth-User' => '$uid' },
        },

        # Vhost options
        vhostOptions => $ini->{vhostOptions} || {},

        # Exported variables
        exportedVars => $ini->{exportedVars} || {
            uid  => 'uid',
            mail => 'mail',
            cn   => 'cn',
        },

        # Macros and groups
        macros => $ini->{macros} || {},
        groups => $ini->{groups} || {},

        # Misc
        timeout          => $ini->{timeout} || 7200,
        timeoutActivity  => $ini->{timeoutActivity} || 0,
        whatToTrace      => $ini->{whatToTrace} || 'uid',
        key              => $ini->{key} || 'qwertyui',
    };

    # Merge any additional config from ini
    foreach my $k (keys %$ini) {
        unless (exists $config->{$k}) {
            $config->{$k} = $ini->{$k};
        }
    }

    my $configFile = "$main::tmpDir/lmConf-1.json";
    open( my $fh, '>', $configFile ) or die "Cannot write $configFile: $!";
    print $fh JSON::to_json( $config, { pretty => 1 } );
    close $fh;

    main::note("Wrote config to $configFile");
}

sub writeIniFile {
    my $self = shift;

    my $iniFile = "$main::tmpDir/lemonldap-ng.ini";
    open( my $fh, '>', $iniFile ) or die "Cannot write $iniFile: $!";
    print $fh "[configuration]\n";
    print $fh "type = File\n";
    print $fh "dirName = $main::tmpDir\n";
    print $fh "\n";
    print $fh "[sessions]\n";
    print $fh "storageModule = Apache::Session::File\n";
    print $fh "Directory = $main::tmpDir\n";
    print $fh "LockDirectory = $main::tmpDir/lock\n";
    close $fh;

    main::note("Wrote INI to $iniFile");
}

sub startJsServer {
    my $self = shift;

    # Find the test-server script in portal package
    my $testLibDir = dirname(__FILE__);
    my $projectRoot = File::Spec->rel2abs( File::Spec->catdir( $testLibDir, '..' ) );
    my $serverScript = "$projectRoot/packages/portal/scripts/test-server.js";

    unless ( -f $serverScript ) {
        die "Test server not found at $serverScript. Run 'npm run build' first.";
    }

    my $port = $self->serverPort;
    $self->serverUrl("http://localhost:$port");

    # Set environment variables for the server
    $ENV{LLNG_TMPDIR} = $main::tmpDir;
    $ENV{LLNG_PORT} = $port;
    $ENV{LLNG_DEFAULTCONFFILE} = "$main::tmpDir/lemonldap-ng.ini";
    $ENV{LLNG_LOGLEVEL} = $ENV{DEBUG} ? 'debug' : 'warn';

    my $pid = fork();
    if ( $pid == 0 ) {
        # Child process - start Node.js server
        exec( 'node', $serverScript, "--port=$port", "--tmpdir=$main::tmpDir" )
          or die "Failed to exec node: $!";
    }
    elsif ( !defined $pid ) {
        die "Fork failed: $!";
    }

    $self->jsServerPid($pid);
    main::note("Started Node.js server (PID: $pid) on port $port");

    # Wait for server to be ready
    my $ready = 0;
    for ( my $i = 0; $i < 50; $i++ ) {  # 5 seconds timeout
        my $sock = IO::Socket::INET->new(
            PeerAddr => 'localhost',
            PeerPort => $port,
            Proto    => 'tcp',
            Timeout  => 1,
        );
        if ($sock) {
            close($sock);
            # Try health endpoint
            my $res = $self->ua->get("$self->{serverUrl}/health");
            if ( $res->is_success ) {
                $ready = 1;
                last;
            }
        }
        select( undef, undef, undef, 0.1 );  # Sleep 100ms
    }

    unless ($ready) {
        $self->DEMOLISH();
        die "Server failed to start within 5 seconds";
    }

    main::note("Server is ready");
}

sub DEMOLISH {
    my $self = shift;

    if ( my $pid = $self->jsServerPid ) {
        main::note("Stopping Node.js server (PID: $pid)");
        kill( 'TERM', $pid );

        # Wait for process to exit
        my $waited = 0;
        for ( my $i = 0; $i < 30; $i++ ) {
            my $res = waitpid( $pid, WNOHANG );
            if ( $res == $pid || $res == -1 ) {
                $waited = 1;
                last;
            }
            select( undef, undef, undef, 0.1 );
        }

        unless ($waited) {
            kill( 'KILL', $pid );
            waitpid( $pid, 0 );
        }

        $self->jsServerPid(undef);
    }
}

=head4 _get( $path, %args )

Make a GET request to the Node.js server

=cut

sub _get {
    my ( $self, $path, %args ) = @_;

    # Build the URL
    my $url = $self->serverUrl . $path;
    if ( $args{query} ) {
        my $q = ref($args{query}) eq 'HASH'
            ? main::buildForm($args{query})
            : $args{query};
        $url .= '?' . $q;
    }

    # Build the request
    my $req = HTTP::Request->new( ( $args{method} || 'GET' ) => $url );

    # Set headers
    $req->header( 'Accept' => $args{accept} // $self->accept );
    $req->header( 'Accept-Language' => 'en-US,fr-FR;q=0.7,fr;q=0.3' );
    $req->header( 'Host' => $args{host} || 'auth.example.com' );
    $req->header( 'User-Agent' => 'Mozilla/5.0 (VAX-4000; rv:36.0) Gecko/20350101 Firefox' );

    if ( $args{cookie} ) {
        $req->header( 'Cookie' => $args{cookie} );
    }

    if ( $args{referer} ) {
        $req->header( 'Referer' => $args{referer} );
    }

    # Add X-Forwarded-For for remote address
    $req->header( 'X-Forwarded-For' => $args{ip} || '127.0.0.1' );

    # Add X-Forwarded-Proto for HTTPS
    $req->header( 'X-Forwarded-Proto' => $args{secure} ? 'https' : 'http' );

    # Custom headers
    if ( $args{custom} ) {
        while ( my ( $k, $v ) = each %{ $args{custom} } ) {
            # Convert PSGI-style names to HTTP header names
            $k =~ s/^HTTP_//;
            $k =~ s/_/-/g;
            $req->header( $k => $v );
        }
    }

    # Make the request
    my $res = $self->ua->request($req);

    # Convert to PSGI format
    return $self->_http_to_psgi($res);
}

=head4 _post( $path, $body, %args )

Make a POST request to the Node.js server

=cut

sub _post {
    my ( $self, $path, $body, %args ) = @_;

    # Handle body
    my $content;
    if ( ref($body) eq 'HASH' ) {
        $content = main::buildForm($body);
    }
    elsif ( ref($body) && $body->can('read') ) {
        # It's a file handle (IO::String)
        local $/;
        $content = <$body>;
    }
    else {
        $content = $body;
    }

    # Build the URL
    my $url = $self->serverUrl . $path;
    if ( $args{query} ) {
        my $q = ref($args{query}) eq 'HASH'
            ? main::buildForm($args{query})
            : $args{query};
        $url .= '?' . $q;
    }

    # Build the request
    my $method = $args{method} || 'POST';
    my $req = HTTP::Request->new( $method => $url );

    # Set headers
    $req->header( 'Accept' => $args{accept} // $self->accept );
    $req->header( 'Accept-Language' => 'en-US,fr-FR;q=0.7,fr;q=0.3' );
    $req->header( 'Host' => $args{host} || 'auth.example.com' );
    $req->header( 'User-Agent' => 'Mozilla/5.0 (VAX-4000; rv:36.0) Gecko/20350101 Firefox' );
    $req->header( 'Content-Type' => $args{type} || 'application/x-www-form-urlencoded' );

    if ( $args{cookie} ) {
        $req->header( 'Cookie' => $args{cookie} );
    }

    if ( $args{referer} ) {
        $req->header( 'Referer' => $args{referer} );
    }

    # Add X-Forwarded headers
    $req->header( 'X-Forwarded-For' => $args{ip} || '127.0.0.1' );
    $req->header( 'X-Forwarded-Proto' => $args{secure} ? 'https' : 'http' );

    # Custom headers
    if ( $args{custom} ) {
        while ( my ( $k, $v ) = each %{ $args{custom} } ) {
            $k =~ s/^HTTP_//;
            $k =~ s/_/-/g;
            $req->header( $k => $v );
        }
    }

    # Set content
    $req->content($content);

    # Make the request
    my $res = $self->ua->request($req);

    # Convert to PSGI format
    return $self->_http_to_psgi($res);
}

=head4 _delete( $path, %args )

Make a DELETE request

=cut

sub _delete {
    my ( $self, $path, %args ) = @_;
    $args{method} = 'DELETE';
    return $self->_get( $path, %args );
}

=head4 _options( $path, %args )

Make an OPTIONS request

=cut

sub _options {
    my ( $self, $path, %args ) = @_;
    $args{method} = 'OPTIONS';
    return $self->_get( $path, %args );
}

=head4 _put( $path, $body, %args )

Make a PUT request

=cut

sub _put {
    my ( $self, $path, $body, %args ) = @_;
    $args{method} = 'PUT';
    return $self->_post( $path, $body, %args );
}

=head4 _http_to_psgi( $http_response )

Convert an HTTP::Response to PSGI format [$status, \@headers, [$body]]

=cut

sub _http_to_psgi {
    my ( $self, $res ) = @_;

    my $status = $res->code;

    # Convert headers to flat array
    my @headers;
    $res->headers->scan( sub {
        my ( $name, $value ) = @_;
        push @headers, $name, $value;
    } );

    # Get body
    my $body = $res->decoded_content || $res->content || '';

    return [ $status, \@headers, [$body] ];
}

=head4 login($uid, $getParams)

Do a simple login using the Demo backend

=cut

sub login {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $self, $uid, $getParams ) = @_;
    my $res;
    $getParams ||= {};

    my $query = main::buildForm( {
            user     => $uid,
            password => $uid,
            %$getParams,
        }
    );
    main::ok(
        $res = $self->_post(
            '/',
            $query,
            length => length($query),
        ),
        'Auth query'
    );
    main::count(1);
    main::expectOK($res);
    my $id = main::expectCookie($res);
    return $id;
}

=head4 logout($id)

Logout and verify

=cut

sub logout {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $self, $id, $cookieName ) = @_;
    my $res;
    $cookieName ||= 'lemonldap';

    main::ok(
        $res = $self->_get(
            '/',
            query  => 'logout',
            cookie => "$cookieName=$id",
            accept => 'text/html'
        ),
        'Logout request'
    );
    main::ok( $res->[0] == 200, ' Response is 200' )
      or main::explain( $res->[0], 200 );
    my $c;
    main::ok(
        ( defined( $c = main::getCookies($res)->{$cookieName} ) and not $c ),
        ' Cookie is deleted' )
      or main::explain( $res->[1], "Set-Cookie => 'lemonldap='" );
    main::ok( not( main::getCookies($res)->{"${cookieName}pdata"} ),
        ' No pdata' );
    main::ok( $res = $self->_get( '/', cookie => "$cookieName=$id" ),
        'Disconnect request' );
    main::ok( $res->[0] == 401, ' Response is 401' )
      or main::explain( $res, 401 );
    main::count(6);
}

1;
