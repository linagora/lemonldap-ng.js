# Stub for PSGI tests - not applicable for JS implementation
# The JS implementation uses Express/HTTP directly

sub mirror {
    my %args = @_;
    # Return a mock PSGI response for authenticated user
    return [
        200,
        ['Content-Type' => 'text/plain', 'Lm-Remote-User' => 'dwho'],
        ['OK']
    ];
}

1;
