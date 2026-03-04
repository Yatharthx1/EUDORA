from fastapi import FastAPI
from backend.api.routes import router

app = FastAPI()

app.include_router(router, prefix="/api")   