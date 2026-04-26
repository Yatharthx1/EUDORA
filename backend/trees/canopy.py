"""Canopy coverage scoring from NDVI arrays."""

import numpy as np


def canopy_coverage(ndvi_array: np.ndarray, ndvi_threshold: float = 0.4) -> float:
    """Return the share of valid NDVI pixels above the vegetation threshold."""

    if ndvi_array.ndim != 2:
        raise ValueError("NDVI input must be a 2D array.")

    valid_pixels = ~np.isnan(ndvi_array)
    valid_count = np.count_nonzero(valid_pixels)
    if valid_count == 0:
        return 0.0

    vegetation_count = np.count_nonzero((ndvi_array > ndvi_threshold) & valid_pixels)
    return float(vegetation_count / valid_count)


def canopy_score_to_label(score: float) -> str:
    """Return a human-readable canopy density label for a 0-1 score."""

    if score < 0.1:
        return "bare"
    if score < 0.3:
        return "sparse"
    if score <= 0.6:
        return "moderate"
    return "dense"


__all__ = [
    "canopy_coverage",
    "canopy_score_to_label",
]
