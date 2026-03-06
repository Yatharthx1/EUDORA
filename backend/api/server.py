from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.api.routes import router
from backend.routing.graph_builder import build_graph
from backend.signal.signal_model import SignalModel
from backend.pollution.pollution_model import PollutionModel
from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- startup ----
    print("[Startup] Building graph...")
    G = build_graph()

    print("[Startup] Attaching signal weights...")
    signal_model = SignalModel(G)
    signal_model.attach_signal_weights()

    print("[Startup] Attaching pollution weights...")
    pollution_model = PollutionModel(G)
    pollution_model.attach_pollution_weights()

    # Store on app.state so all routes can access them via request.app.state
    app.state.G               = G
    app.state.signal_model    = signal_model
    app.state.pollution_model = pollution_model

    print("[Startup] Ready.")

    yield

    # ---- shutdown ----
    print("[Shutdown] Cleaning up...")
    app.state.G               = None
    app.state.signal_model    = None
    app.state.pollution_model = None


app = FastAPI(lifespan=lifespan)
app.include_router(router, prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)