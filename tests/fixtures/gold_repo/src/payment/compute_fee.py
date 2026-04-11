def compute_fee(amount_cents: int) -> int:
    """Return platform fee in cents for a transaction amount."""
    if amount_cents <= 0:
        return 0
    return max(1, amount_cents // 100)
