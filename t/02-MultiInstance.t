use warnings;
use Test::More;
use strict;
use IO::String;

BEGIN {
    require 't/test-lib.pm';
}

my $debug = 'error';
my ( $instance1, $instance2, $res );

# Test: Create two independent Demo auth instances
# This verifies that the multi-instance harness works

# Create first instance
ok(
    $instance1 = register(
        'portal1',
        sub {
            LLNG::Manager::Test->new({
                ini => {
                    logLevel       => $debug,
                    domain         => 'example1.com',
                    portal         => 'http://auth.example1.com/',
                    authentication => 'Demo',
                    userDB         => 'Same',
                }
            });
        }
    ),
    'Instance 1 created'
);

note("Instance 1 running at: " . $instance1->serverUrl);

# Create second instance (different port)
ok(
    $instance2 = register(
        'portal2',
        sub {
            LLNG::Manager::Test->new({
                ini => {
                    logLevel       => $debug,
                    domain         => 'example2.com',
                    portal         => 'http://auth.example2.com/',
                    authentication => 'Demo',
                    userDB         => 'Same',
                }
            });
        }
    ),
    'Instance 2 created'
);

note("Instance 2 running at: " . $instance2->serverUrl);

# Verify both instances are on different ports
ok(
    $instance1->serverPort != $instance2->serverPort,
    'Instances are on different ports'
);

# Test health endpoints
ok( $res = $instance1->_get('/health'), 'Instance 1 health' );
expectOK($res);
ok( $res = $instance2->_get('/health'), 'Instance 2 health' );
expectOK($res);

# Login to instance 1
my $cookie1 = $instance1->login('dwho');
ok( $cookie1, 'Logged in to instance 1 as dwho' );

# Login to instance 2 with different user
my $cookie2 = $instance2->login('rtyler');
ok( $cookie2, 'Logged in to instance 2 as rtyler' );

# Verify sessions are independent
ok( $cookie1 ne $cookie2, 'Session cookies are different' );

# Verify authenticated requests work on both
ok(
    $res = $instance1->_get(
        '/',
        cookie => "lemonldap=$cookie1",
        accept => 'application/json',
    ),
    'Auth request to instance 1'
);
expectOK($res);
my $json1 = expectJSON($res);
is( $json1->{user}, 'dwho', 'Instance 1: correct user dwho' );

ok(
    $res = $instance2->_get(
        '/',
        cookie => "lemonldap=$cookie2",
        accept => 'application/json',
    ),
    'Auth request to instance 2'
);
expectOK($res);
my $json2 = expectJSON($res);
is( $json2->{user}, 'rtyler', 'Instance 2: correct user rtyler' );

# Cross-instance check: cookie from instance 1 should not work on instance 2
# (different session stores)
ok(
    $res = $instance2->_get(
        '/',
        cookie => "lemonldap=$cookie1",
        accept => 'application/json',
    ),
    'Cross-instance check: cookie1 on instance2'
);
ok( $res->[0] == 401, 'Cookie from instance 1 rejected on instance 2' )
    or explain( $res->[0], 401 );

# Test switch() function
my $switched = switch('portal1');
ok( $switched == $instance1, 'switch() returns correct instance' );

# Test getInstances()
my $instances = getInstances();
ok( exists $instances->{portal1}, 'getInstances has portal1' );
ok( exists $instances->{portal2}, 'getInstances has portal2' );

# Logout from both
$instance1->logout($cookie1);
$instance2->logout($cookie2);

# Cleanup
clean_sessions();
done_testing();
