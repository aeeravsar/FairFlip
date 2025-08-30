import hashlib

def keccak256(data: bytes) -> bytes:
    try:
        import sha3  # pysha3
        k = sha3.keccak_256()
    except ImportError:
        raise ImportError("Install pysha3 with: pip install pysha3")
    k.update(data)
    return k.digest()

def xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))

print("=== Fair Coinflip Simulator ===")

# Player A setup
secret_a = input("Player A - Enter your secret (hex or string): ")
secret_a_bytes = bytes.fromhex(secret_a) if all(c in '0123456789abcdef' for c in secret_a.lower()) else secret_a.encode()
commit_a = keccak256(secret_a_bytes)
print(f"Player A's commitment: {commit_a.hex()}")

# Player B input
secret_b = input("Player B - Enter your secret (hex or string): ")
secret_b_bytes = bytes.fromhex(secret_b) if all(c in '0123456789abcdef' for c in secret_b.lower()) else secret_b.encode()

# Reveal phase
print("\n=== Reveal Phase ===")
print("Player A reveals secret to verify commitment...")

if keccak256(secret_a_bytes) != commit_a:
    print("Commitment mismatch! Player A is cheating.")
    exit(1)

# Compute randomness
xor = xor_bytes(secret_a_bytes.ljust(32, b'\x00'), secret_b_bytes.ljust(32, b'\x00'))
final_hash = keccak256(xor)
outcome = int.from_bytes(final_hash, 'big') % 2

print(f"\nFinal Hash: {final_hash.hex()}")
print(f"Outcome: {outcome} -> {'Player A wins' if outcome == 0 else 'Player B wins'}")
