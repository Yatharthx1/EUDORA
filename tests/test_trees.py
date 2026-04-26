import ee
import os
import numpy as np
from dotenv import load_dotenv

load_dotenv()
ee.Initialize(project=os.getenv("GEE_PROJECT_ID"))

from backend.trees import canopy_coverage, canopy_score_to_label, fetch_route_ndvi_array

test_coords = [
    (22.7196, 75.8577),
    (22.7280, 75.8800),
]

print("Fetching NDVI...")
ndvi = fetch_route_ndvi_array(test_coords)

valid = ndvi[~np.isnan(ndvi)]
print(f"NDVI range: {valid.min():.2f} to {valid.max():.2f}")
print(f"Pixels above 0.4 threshold: {(valid > 0.4).sum()}")
valid = ndvi[~np.isnan(ndvi)]
print(f"NDVI range: {valid.min():.2f} to {valid.max():.2f}")
print(f"Pixels above 0.4: {(valid > 0.4).sum()}")
print("Computing canopy coverage...")
score = canopy_coverage(ndvi)
print(f"Canopy coverage: {score:.2f}")
print(f"Canopy label: {canopy_score_to_label(score)}")
