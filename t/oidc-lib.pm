# OIDC test helpers for LemonLDAP-NG JS implementation
#
# This provides OIDC test keys and helper functions compatible with
# the Perl reference implementation tests.

package main;

use strict;
use warnings;
use MIME::Base64;
use JSON;

# Try to load LLNG JWT module for token parsing
my $hasJWT;
BEGIN {
    $hasJWT = eval { require Lemonldap::NG::Common::JWT; 1 };
    if ($hasJWT) {
        Lemonldap::NG::Common::JWT->import(qw/getJWTPayload getJWTHeader/);
    }
}

=head1 NAME

oidc-lib.pm - OIDC test helpers

=head1 DESCRIPTION

This module provides OIDC test keys and helper functions for testing
OIDC flows between OP (OpenID Provider) and RP (Relying Party).

=head2 Test Keys

=cut

sub oidc_key_op_private_ec_sig {
    '-----BEGIN EC PRIVATE KEY-----
MIIBUQIBAQQggmWd5U3Stm54SoTlH18+b7n1/T5agIin9BqwpGnCwMuggeMwgeAC
AQEwLAYHKoZIzj0BAQIhAP////8AAAABAAAAAAAAAAAAAAAA////////////////
MEQEIP////8AAAABAAAAAAAAAAAAAAAA///////////////8BCBaxjXYqjqT57Pr
vVV2mIa8ZR0GsMxTsPY7zjw+J9JgSwRBBGsX0fLhLEJH+Lzm5WOkQPJ3A32BLesz
oPShOUXYmMKWT+NC4v4af5uO5+tKfA+eFivOM1drMV7Oy7ZAaDe/UfUCIQD/////
AAAAAP//////////vOb6racXnoTzucrC/GMlUQIBAaFEA0IABG+Hq4JussV3gHNt
KADLOTyfvvEbZSX/izaftpK05tVU39YTYz54PKOOcgXPvmoPPreVaQLhL2YjxFPD
p2qalrs=
-----END EC PRIVATE KEY-----';
}

sub oidc_key_op_public_ec_sig {
    '-----BEGIN PUBLIC KEY-----
MIIBMzCB7AYHKoZIzj0CATCB4AIBATAsBgcqhkjOPQEBAiEA/////wAAAAEAAAAA
AAAAAAAAAAD///////////////8wRAQg/////wAAAAEAAAAAAAAAAAAAAAD/////
//////////wEIFrGNdiqOpPns+u9VXaYhrxlHQawzFOw9jvOPD4n0mBLBEEEaxfR
8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpZP40Li/hp/m47n60p8D54WK84z
V2sxXs7LtkBoN79R9QIhAP////8AAAAA//////////+85vqtpxeehPO5ysL8YyVR
AgEBA0IABG+Hq4JussV3gHNtKADLOTyfvvEbZSX/izaftpK05tVU39YTYz54PKOO
cgXPvmoPPreVaQLhL2YjxFPDp2qalrs=
-----END PUBLIC KEY-----';
}

sub oidc_key_op_private_sig {
    "-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAs2jsmIoFuWzMkilJaA8//5/T30cnuzX9GImXUrFR2k9EKTMt
GMHCdKlWOl3BV+BTAU9TLz7Jzd/iJ5GJ6B8TrH1PHFmHpy8/qE/S5OhinIpIi7eb
ABqnoVcwDdCa8ugzq8k8SWxhRNXfVIlwz4NH1caJ8lmiERFj7IvNKqEhzAk0pyDr
8hubveTC39xREujKlsqutpPAFPJ3f2ybVsdykX5rx0h5SslG3jVWYhZ/SOb2aIzO
r0RMjhQmsYRwbpt3anjlBZ98aOzg7GAkbO8093X5VVk9vaPRg0zxJQ0Do0YLyzkR
isSAIFb0tdKuDnjRGK6y/N2j6At2HjkxntbtGQIDAQABAoIBADYq6LxJd977LWy3
0HT9nboFPIf+SM2qSEc/S5Po+6ipJBA4ZlZCMf7dHa6znet1TDpqA9iQ4YcqIHMH
6xZNQ7hhgSAzG9TrXBHqP+djDlrrGWotvjuy0IfS9ixFnnLWjrtAH9afRWLuG+a/
NHNC1M6DiiTE0TzL/lpt/zzut3CNmWzH+t19X6UsxUg95AzooEeewEYkv25eumWD
mfQZfCtSlIw1sp/QwxeJa/6LJw7KcPZ1wXUm1BN0b9eiKt9Cmni1MS7elgpZlgGt
xtfGTZtNLQ7bgDiM8MHzUfPBhbceNSIx2BeCuOCs/7eaqgpyYHBbAbuBQex2H61l
Lcc3Tz0CgYEA4Kx/avpCPxnvsJ+nHVQm5d/WERuDxk4vH1DNuCYBvXTdVCGADf6a
F5No1JcTH3nPTyPWazOyGdT9LcsEJicLyD8vCM6hBFstG4XjqcAuqG/9DRsElpHQ
yi1zc5DNP7Vxmiz9wII0Mjy0abYKtxnXh9YK4a9g6wrcTpvShhIcIb8CgYEAzGzG
lorVCfX9jXULIznnR/uuP5aSnTEsn0xJeqTlbW0RFWLdj8aIL1peirh1X89HroB9
GeTNqEJXD+3CVL2cx+BRggMDUmEz4hR59meZCDGUyT5fex4LIsceb/ESUl2jo6Sw
HXwWbN67rQ55N4oiOcOppsGxzOHkl5HdExKidycCgYEAr5Qev2tz+fw65LzfzHvH
Kj4S/KuT/5V6He731cFd+sEpdmX3vPgLVAFPG1Q1DZQT/rTzDDQKK0XX1cGiLG63
NnaqOye/jbfzOF8Z277kt51NFMDYhRLPKDD82IOA4xjY/rPKWndmcxwdob8yAIWh
efY76sMz6ntCT+xWSZA9i+ECgYBWMZM2TIlxLsBfEbfFfZewOUWKWEGvd9l5vV/K
D5cRIYivfMUw5yPq2267jPUolayCvniBH4E7beVpuPVUZ7KgcEvNxtlytbt7muil
5Z6X3tf+VodJ0Swe2NhTmNEB26uwxzLe68BE3VFCsbSYn2y48HAq+MawPZr18bHG
ZfgMxwKBgHHRg6HYqF5Pegzk1746uH2G+OoCovk5ylGGYzcH2ghWTK4agCHfBcDt
EYqYAev/l82wi+OZ5O8U+qjFUpT1CVeUJdDs0o5u19v0UJjunU1cwh9jsxBZAWLy
PAGd6SWf4S3uQCTw6dLeMna25YIlPh5qPA6I/pAahe8e3nSu2ckl
-----END RSA PRIVATE KEY----- ";
}

sub oidc_key_op_public_sig {
    "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs2jsmIoFuWzMkilJaA8/
/5/T30cnuzX9GImXUrFR2k9EKTMtGMHCdKlWOl3BV+BTAU9TLz7Jzd/iJ5GJ6B8T
rH1PHFmHpy8/qE/S5OhinIpIi7ebABqnoVcwDdCa8ugzq8k8SWxhRNXfVIlwz4NH
1caJ8lmiERFj7IvNKqEhzAk0pyDr8hubveTC39xREujKlsqutpPAFPJ3f2ybVsdy
kX5rx0h5SslG3jVWYhZ/SOb2aIzOr0RMjhQmsYRwbpt3anjlBZ98aOzg7GAkbO80
93X5VVk9vaPRg0zxJQ0Do0YLyzkRisSAIFb0tdKuDnjRGK6y/N2j6At2Hjkxntbt
GQIDAQAB
-----END PUBLIC KEY-----";
}

sub oidc_cert_op_public_sig {
    "-----BEGIN CERTIFICATE-----
MIIC/zCCAeegAwIBAgIUYFySF9bmkPZK1u+wdkwTSS9bxnMwDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEVGVzdDAeFw0yMjExMjkxNDI2MTFaFw00MjAxMjgxNDI2
MTFaMA8xDTALBgNVBAMMBFRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQCzaOyYigW5bMySKUloDz//n9PfRye7Nf0YiZdSsVHaT0QpMy0YwcJ0qVY6
XcFX4FMBT1MvPsnN3+InkYnoHxOsfU8cWYenLz+oT9Lk6GKcikiLt5sAGqehVzAN
0Jry6DOryTxJbGFE1d9UiXDPg0fVxonyWaIREWPsi80qoSHMCTSnIOvyG5u95MLf
3FES6MqWyq62k8AU8nd/bJtWx3KRfmvHSHlKyUbeNVZiFn9I5vZojM6vREyOFCax
hHBum3dqeOUFn3xo7ODsYCRs7zT3dflVWT29o9GDTPElDQOjRgvLORGKxIAgVvS1
0q4OeNEYrrL83aPoC3YeOTGe1u0ZAgMBAAGjUzBRMB0GA1UdDgQWBBS/LX4E0Ipq
h/4wcxNIXvoksj4vizAfBgNVHSMEGDAWgBS/LX4E0Ipqh/4wcxNIXvoksj4vizAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAZk2m++tQ/FkZedpoA
BlbRjvWjQ8u6qH5zaqS5oxnNX/JfJEFOsqL2n37g/0wuu6HhSYh2vD+zc4KfVMrj
v6wzzmspJaZnACQLlEoB+ZKC1P+a8R95BK8iL1Dp1Iy0SC8CR6ZvQDEHNGWm8SAC
K/cm2ee4wv4obg336SjXZ+Wid8lmdKDpJ7/XjiK2NQuvDLw6Jt7QpItKqwajEcJ/
BOYQi7AAYtRBfi0v99nm3L2XF2ijTsIHDGhQqliFTXYwKO6ErCevEpDfDF28txqT
R333fBH0ADco70lNPVTfOtpfdTjKvJ3N9SmU9V0BbhtegzMeung3QBmtMxApt8++
LcJp
-----END CERTIFICATE-----";
}

sub oidc_cert_op_public_sig_x5t {
    return "4Pims8kl3DEgB2ld9pmvz9svAxo";
}

sub alt_oidc_key_op_private_sig {
    '-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCWS2Wd0gXbiMDU
69k27D2FByrzpogZtjhQCVdIiF8/CDNeB7FZlIRPbRVYFeapCo5gmBldx89gf8y9
QqnCmCLCCo7zy/xL07niDrmnh1AIZYJ9QPEdBuKqicXVX0luhpgIEZNL47cciLzU
09EBBhMB/abRZzGh+gwlQSpQM2WRYKe3h8ERHsxVSnWUqR7w4/zwmUCTB22dlTSS
FfOYfaYG0YeKQUmenv5DMjanDHz3W7GzSQarpGbPzrPq7M0nmvToyCfuB+butNUX
1lCUszT6hGgKm5A1U5dJr3mLX9bOLnsrrG0EbAHz3WfJan5NqcZkzH2zTiJOVck4
NoSz3O6LAgMBAAECggEAEFXDhqK0FkdHxhyYMDr++L1tsquv8TN37WMGhJCl4YDv
rFGjufvFYaiWgEtpFYhbLy5421ODO5bIVu2u68KDTJm/LcpG8qrhcittjELNtQvr
Yde0HRaJfkWZJfbEUWn5ji7y1nW6ijRmaa9X8QeK+1VpUysnHtbBiS8K/UqIyIMR
KxKskc7hoDG5J11UUTznLSRiqulSGCVbOmTrswH8Wk8EFL3HZSqYgpvSmptrYKYb
7NmmOhH/6KnwRQp22pN8/qG5m9E4I+jJR57hdG829fI8PCJywZC4Az27MMZNQPGv
nzdjHas+LiIJsXdlSOxG3yO6C4eWUYyxzpGWh3z+sQKBgQDMP2oFo8UDYX5YcZvG
P5NsXhqb9kapZk0x4xb+kkHy5mRhEOwB4668Ndyif4GRPuEpxOsvF1e58bc0yy+z
6OES12lwlr358KeG5DG2N2pQofDPBhoB0Z5DF5sXvjRYqQyB/9RJlQbB4QeRdKo1
Pnrz0Uh90XrqswBYUBVyInmqiQKBgQC8YEssTA3dQXNwAt5ZNhrR1makWZ4exIt+
AJww3euBO0KejtSJ3JQepNhSC6cGvrb2FqJy2YwujQROmxgQ+jZbwY65J4fjP4BO
cE3E+lFudRHiUl0CXfoPqN7HtXfBmG4cEorR2XosOKLhdE2cLUfFsd0EHSOeyQyB
ksssMLn7cwKBgQCWcN8W6Fnk85qsaoHitFFSML5Iwk2p2MBjTnFRcUlCMJEfLeeo
PJwn5URuLJyy7y3KJlFUjkz/mRrouACa851U03XGiEHGJ4w9vzcekBKu8Zj94/Ck
BlIb+PcztdW4uEuONXGYATzI8YcxjE0SisLlc/GBOxreZJqMcfBZ8SrMgQKBgQCi
CdrgEdPjPQfFlFIbPzU2x0ynlwcyxDKRgojYaCzKj2Uw6v/cTseCzJ3fhXJ5lNfh
O3slfAjfiiHoU/URtYnIx+izUFPNoLQHxQbAp+ogL8fgfKTRAnG1wrdP5sNK3ono
z/JlrMMxAs7pTJft/e09G1BY14/qaFq/orvuGUQCDQKBgBlfhj00UvuEXIXawvTj
F+Q4gn+xAc3xGc+A1pf0Mwg1yWxCUcSXwwY9ebayl21FTBD0IlF/B2FHxLt1E4iK
SF0LnH9iFxzSIeon4TABUnmOef/n0R80CgV5XZTQr2zcYR5I4Z6RDwFV1xRDS6le
yf45nEm/1yEZX6iu3wGBfixM
-----END PRIVATE KEY-----';
}

sub alt_oidc_cert_op_public_sig {
    '-----BEGIN CERTIFICATE-----
MIICsjCCAZqgAwIBAgIEAM8InTANBgkqhkiG9w0BAQsFADAbMRkwFwYDVQQDDBBh
dXRoLmV4YW1wbGUuY29tMB4XDTIzMTIyMTAyMjgxN1oXDTQzMTIxNjAyMjgxN1ow
GzEZMBcGA1UEAwwQYXV0aC5leGFtcGxlLmNvbTCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAJZLZZ3SBduIwNTr2TbsPYUHKvOmiBm2OFAJV0iIXz8IM14H
sVmUhE9tFVgV5qkKjmCYGV3Hz2B/zL1CqcKYIsIKjvPL/EvTueIOuaeHUAhlgn1A
8R0G4qqJxdVfSW6GmAgRk0vjtxyIvNTT0QEGEwH9ptFnMaH6DCVBKlAzZZFgp7eH
wREezFVKdZSpHvDj/PCZQJMHbZ2VNJIV85h9pgbRh4pBSZ6e/kMyNqcMfPdbsbNJ
BqukZs/Os+rszSea9OjIJ+4H5u601RfWUJSzNPqEaAqbkDVTl0mveYtf1s4ueyus
bQRsAfPdZ8lqfk2pxmTMfbNOIk5VyTg2hLPc7osCAwEAATANBgkqhkiG9w0BAQsF
AAOCAQEAUbO7UX8N23nKfWU7YhZZyjncMNTPmeqWqOciLaAhpeB2W6cgDi2ddCjR
E10s8cnyd8QDZC5wLGHDeBsPoeb5KdXdxi4x4w+IZrnq+NputA7sRtmRaDVe16LY
0RRPYmElR0KGpXRp5gXQrF0qF4+xM1ggrj4fMKccpZoPYaQQa43BAGh7Ay9mu6Ux
K6dXdRI1oP964BjmLE4psuZdeWZt/nl7BKv9uLrCPIPiQWXKbQFtCxi8si8AeaDt
52oFL+7e0A//DWZQ2p0yEPh1Ge6d7TZ83a5Qa9nIFzXePjT2vC9DGIkhwBOaUD0b
vyWVJ/bZUDjRu1nAer3/1t7RlTI0KA==
-----END CERTIFICATE-----';
}

=head2 getKey Helper

Convenience function to get keys by name.

=cut

sub getKey {
    my $name = shift;
    if ($name eq 'oidc_private' || $name eq 'op_private') {
        return oidc_key_op_private_sig();
    }
    if ($name eq 'oidc_public' || $name eq 'op_public') {
        return oidc_key_op_public_sig();
    }
    if ($name eq 'ec_private') {
        return oidc_key_op_private_ec_sig();
    }
    if ($name eq 'ec_public') {
        return oidc_key_op_public_ec_sig();
    }
    if ($name eq 'alt_private') {
        return alt_oidc_key_op_private_sig();
    }
    if ($name eq 'alt_public' || $name eq 'alt_cert') {
        return alt_oidc_cert_op_public_sig();
    }
    die "Unknown key: $name";
}

=head2 JWT Helpers

Functions to parse and inspect JWT tokens.

=cut

sub id_token_payload {
    my $token = shift;
    if ($hasJWT) {
        return getJWTPayload($token);
    }
    # Fallback: manual base64url decode
    my @parts = split /\./, $token;
    return undef unless @parts >= 2;
    my $payload = $parts[1];
    # Convert base64url to base64
    $payload =~ tr/-_/+\//;
    # Add padding
    while (length($payload) % 4) {
        $payload .= '=';
    }
    return JSON::from_json(decode_base64($payload));
}

sub id_token_header {
    my $token = shift;
    if ($hasJWT) {
        return getJWTHeader($token);
    }
    # Fallback: manual base64url decode
    my @parts = split /\./, $token;
    return undef unless @parts >= 1;
    my $header = $parts[0];
    # Convert base64url to base64
    $header =~ tr/-_/+\//;
    # Add padding
    while (length($header) % 4) {
        $header .= '=';
    }
    return JSON::from_json(decode_base64($header));
}

=head2 OIDC Flow Helpers

Helper functions for common OIDC operations.

=cut

=head4 oidc_login( $client, $uid )

Login with Demo backend and return session cookie.

=cut

sub oidc_login {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $client, $uid ) = @_;
    my $query = buildForm({
        user     => $uid,
        password => $uid,
    });
    my $res = $client->_post(
        "/",
        $query,
        accept => 'text/html',
        length => length($query),
    );
    return expectCookie($res);
}

=head4 authorize( $op, $id, $params )

Make authorization request to OP.

=cut

sub authorize {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $op, $id, $params ) = @_;
    my $query = buildForm($params);
    # Note: endpoints are under /oauth2/ to match Perl LemonLDAP::NG convention
    my $res = $op->_get(
        "/oauth2/authorize",
        query  => $query,
        accept => 'text/html',
        cookie => "lemonldap=$id",
    );
    return $res;
}

=head4 codeAuthorize( $op, $id, $params )

Make authorization request and extract code from redirect.

=cut

sub codeAuthorize {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $op, $id, $params ) = @_;
    my $res = authorize( $op, $id, $params );
    my ($code) = expectRedirection( $res, qr#http://.*code=([^\&]*)# );
    return $code;
}

=head4 codeGrant( $op, $clientid, $code, $redirect_uri, %other_params )

Exchange authorization code for tokens.

=cut

sub codeGrant {
    my ( $op, $clientid, $code, $redirect_uri, %other_params ) = @_;
    my $query = buildForm({
        grant_type   => "authorization_code",
        code         => $code,
        redirect_uri => $redirect_uri,
        %other_params,
    });

    my $res = $op->_post(
        "/oauth2/token",
        $query,
        accept => 'application/json',
        length => length($query),
        custom => {
            HTTP_AUTHORIZATION => "Basic " . encode_base64("$clientid:$clientid", ''),
        },
    );
    return $res;
}

=head4 getUserinfo( $op, $access_token )

Get userinfo using access token.

=cut

sub getUserinfo {
    my ( $op, $access_token ) = @_;
    my $res = $op->_post(
        "/oauth2/userinfo",
        '',
        accept => 'application/json',
        length => 0,
        custom => {
            HTTP_AUTHORIZATION => "Bearer " . $access_token,
        },
    );
    return $res;
}

=head4 refreshGrant( $op, $client_id, $refresh_token )

Exchange refresh token for new tokens.

=cut

sub refreshGrant {
    my ( $op, $client_id, $refresh_token ) = @_;
    my $query = buildForm({
        grant_type    => 'refresh_token',
        refresh_token => $refresh_token,
    });

    my $res = $op->_post(
        "/oauth2/token",
        $query,
        accept => 'application/json',
        length => length($query),
        custom => {
            HTTP_AUTHORIZATION => "Basic " . encode_base64("$client_id:$client_id", ''),
        }
    );
    return $res;
}

=head4 introspect( $op, $client_id, $token )

Introspect a token.

=cut

sub introspect {
    my ( $op, $client_id, $token ) = @_;
    my $query = buildForm({
        client_id     => $client_id,
        client_secret => $client_id,
        token         => $token,
    });
    my $res = $op->_post(
        "/oauth2/introspect",
        $query,
        accept => 'application/json',
        length => length($query),
    );
    return $res;
}

=head4 tokenExchange( $op, $clientid, %params )

Perform token exchange (RFC 8693).

=cut

sub tokenExchange {
    my ( $op, $clientid, %params ) = @_;
    my $query = buildForm({
        grant_type => 'urn:ietf:params:oauth:grant-type:token-exchange',
        %params
    });

    my $res = $op->_post(
        "/oauth2/token",
        $query,
        accept => 'application/json',
        length => length($query),
        custom => {
            HTTP_AUTHORIZATION => "Basic " . encode_base64("$clientid:$clientid", ''),
        },
    );
    return $res;
}

=head4 expectJWT( $token, %claims )

Verify token is a JWT and contains expected claims.

=cut

sub expectJWT {
    local $Test::Builder::Level = $Test::Builder::Level + 1;
    my ( $token, %claims ) = @_;
    my $payload = id_token_payload($token);
    ok( $payload, "Token is a JWT" );
    count(1);
    for my $claim ( keys %claims ) {
        is( $payload->{$claim}, $claims{$claim}, "Found claim '$claim' in JWT" );
        count(1);
    }
    return $payload;
}

1;
