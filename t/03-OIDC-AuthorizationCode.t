use warnings;
use Test::More;
use strict;

BEGIN {
    require 't/test-lib.pm';
    require 't/oidc-lib.pm';
}

my $debug = 'error';
my ($res);

# Use the standard OIDC keys (PKCS#1 format, auto-converted to PKCS#8)
my $privateKey = oidc_key_op_private_sig();
my $publicKey = oidc_key_op_public_sig();

# Create instance with OIDC enabled
ok(
    my $op = LLNG::Manager::Test->new({
        ini => {
            logLevel                         => $debug,
            domain                           => 'op.com',
            portal                           => 'http://auth.op.com/',
            authentication                   => 'Demo',
            userDB                           => 'Same',
            issuerDBOpenIDConnectActivation  => 1,
            oidcServiceAllowAuthorizationCodeFlow => 1,
            oidcServicePrivateKeySig         => $privateKey,
            oidcServicePublicKeySig          => $publicKey,
            oidcRPMetaDataOptions => {
                rp => {
                    oidcRPMetaDataOptionsClientID => 'rpid',
                    oidcRPMetaDataOptionsClientSecret => 'rpsecret',
                    oidcRPMetaDataOptionsRedirectUris => 'http://auth.rp.com/callback',
                    oidcRPMetaDataOptionsBypassConsent => 1,
                }
            },
            oidcRPMetaDataExportedVars => {
                rp => {
                    email => 'mail',
                    name => 'cn',
                }
            },
        }
    }),
    'OIDC Provider created'
);

# Test discovery endpoint
ok( $res = $op->_get('/.well-known/openid-configuration'), 'Discovery endpoint' );
expectOK($res);
my $disco = expectJSON($res);
ok( $disco->{issuer}, 'Has issuer' );
ok( $disco->{authorization_endpoint}, 'Has authorization_endpoint' );
ok( $disco->{token_endpoint}, 'Has token_endpoint' );

# Test JWKS endpoint (under /oauth2)
ok( $res = $op->_get('/oauth2/jwks'), 'JWKS endpoint' );
expectOK($res);
my $jwks = expectJSON($res);
ok( exists $jwks->{keys}, 'JWKS has keys array' );

# Login as dwho
my $cookie = $op->login('dwho');
ok( $cookie, 'Logged in as dwho' );

# Authorization request (under /oauth2)
ok(
    $res = $op->_get(
        '/oauth2/authorize',
        query => buildForm({
            response_type => 'code',
            client_id     => 'rpid',
            scope         => 'openid profile email',
            redirect_uri  => 'http://auth.rp.com/callback',
            state         => 'xyzzy',
            nonce         => '12345',
        }),
        cookie => "lemonldap=$cookie",
        accept => 'text/html',
    ),
    'Authorization request'
);

# Should redirect with code
my $location = getHeader($res, 'Location');
ok( $res->[0] == 302, 'Authorization returns 302 redirect' );
ok( $location && $location =~ /code=([^&]+)/, 'Redirect includes code' );

my ($code) = ($location =~ /code=([^&]+)/);
ok( $code, 'Got authorization code' );

# Token request (under /oauth2)
ok(
    $res = $op->_post(
        '/oauth2/token',
        buildForm({
            grant_type    => 'authorization_code',
            code          => $code,
            redirect_uri  => 'http://auth.rp.com/callback',
            client_id     => 'rpid',
            client_secret => 'rpsecret',
        }),
        accept => 'application/json',
    ),
    'Token request'
);
expectOK($res);
my $tokens = expectJSON($res);
ok( $tokens->{access_token}, 'Got access_token' );
ok( $tokens->{id_token}, 'Got id_token' );
is( $tokens->{token_type}, 'Bearer', 'Token type is Bearer' );

# Parse id_token
my $payload = id_token_payload($tokens->{id_token});
ok( $payload, 'id_token is valid JWT' );
is( $payload->{sub}, 'dwho', 'id_token sub is dwho' );
is( $payload->{aud}, 'rpid', 'id_token aud is rpid' );

# UserInfo request (under /oauth2)
ok(
    $res = $op->_get(
        '/oauth2/userinfo',
        custom => {
            HTTP_AUTHORIZATION => "Bearer " . $tokens->{access_token},
        },
        accept => 'application/json',
    ),
    'UserInfo request'
);
expectOK($res);
my $userinfo = expectJSON($res);
is( $userinfo->{sub}, 'dwho', 'UserInfo sub is dwho' );

# Cleanup
$op->logout($cookie);
clean_sessions();
done_testing();
