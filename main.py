from pathlib import Path

import joblib
import pandas as pd

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "Model_Pipeline.pkl"
INDEX_FILE = BASE_DIR / "index.html"
CSS_FILE = BASE_DIR / "style.css"
JS_FILE = BASE_DIR / "script.js"


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="NYC Airbnb Room Type Classification API",
    description="Machine learning API for Airbnb room type prediction.",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# MODEL
# ============================================================

model = joblib.load(MODEL_PATH)


COLUMNS = [
    "latitude",
    "longitude",
    "price",
    "minimum_nights",
    "number_of_reviews",
    "reviews_per_month",
    "calculated_host_listings_count",
    "availability_365",
    "neighbourhood_group",
    "neighbourhood",
]


# ============================================================
# PYDANTIC MODEL
# ============================================================

class Features(BaseModel):
    latitude: float = Field(
        ...,
        ge=-90,
        le=90,
        description="Latitude coordinate",
    )

    longitude: float = Field(
        ...,
        ge=-180,
        le=180,
        description="Longitude coordinate",
    )

    price: float = Field(
        ...,
        gt=0,
        description="Price per night, must be positive",
    )

    minimum_nights: int = Field(
        ...,
        ge=1,
        le=365,
        description="Minimum nights required for booking",
    )

    number_of_reviews: int = Field(
        ...,
        ge=0,
        description="Total number of reviews",
    )

    reviews_per_month: float = Field(
        ...,
        ge=0,
        description="Average reviews per month",
    )

    calculated_host_listings_count: int = Field(
        ...,
        ge=0,
        description="Number of listings by this host",
    )

    availability_365: int = Field(
        ...,
        ge=0,
        le=365,
        description="Days available out of 365",
    )

    neighbourhood_group: str = Field(
        ...,
        min_length=1,
        description="Borough or neighbourhood group",
    )

    neighbourhood: str = Field(
        ...,
        min_length=1,
        description="Specific neighbourhood name",
    )


# ============================================================
# FRONTEND ROUTES
# ============================================================

@app.get("/", include_in_schema=False)
def home():
    return FileResponse(INDEX_FILE)


@app.get("/style.css", include_in_schema=False)
def stylesheet():
    return FileResponse(CSS_FILE)


@app.get("/script.js", include_in_schema=False)
def javascript():
    return FileResponse(JS_FILE)


@app.head("/", include_in_schema=False)
def root_health_check():
    return Response(status_code=200)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "NYC Airbnb Room Type Classification",
    }


# ============================================================
# PREDICTION API
# ============================================================

@app.post("/predict")
def predict(features: Features):

    row = pd.DataFrame(
        [features.model_dump()],
        columns=COLUMNS,
    )

    prediction = model.predict(row)
    probability = model.predict_proba(row)

    return {
        "Predicted_room_type": prediction[0],
        "Probability": probability.tolist()[0],
    }