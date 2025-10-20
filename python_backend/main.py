"""
Main FastAPI application for AI Chip Design Platform
Provides ML/RL endpoints with PyTorch backend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import torch
import logging

from models.dqn import DQNAgent
from models.policy_gradient import PolicyGradientAgent
from models.actor_critic import ActorCriticAgent
from models.ppo import PPOAgent
from models.gnn import GraphNeuralNetwork
from utils.training import TrainingManager
from utils.checkpoint import CheckpointManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="AI Chip Design ML Backend",
    description="PyTorch-based ML/RL backend for chip design optimization",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global managers
checkpoint_manager = CheckpointManager("./checkpoints")
training_manager = TrainingManager()

# Check GPU availability
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"Using device: {device}")


# ============================================================================
# Request/Response Models
# ============================================================================

class Cell(BaseModel):
    id: str
    name: str
    width: float
    height: float
    position: Optional[Dict[str, float]] = None
    pins: List[Dict[str, Any]]
    type: str


class Net(BaseModel):
    id: str
    name: str
    pins: List[str]
    weight: float


class RLTrainingRequest(BaseModel):
    algorithm: str
    cells: List[Cell]
    nets: List[Net]
    chipWidth: float
    chipHeight: float
    episodes: int = 100
    learningRate: float = 0.001
    discountFactor: float = 0.99
    epsilon: float = 0.1
    batchSize: int = 32
    usePretrained: bool = False


class RLTrainingResponse(BaseModel):
    success: bool
    cells: List[Cell]
    totalReward: float
    episodeRewards: List[float]
    wirelength: float
    overlap: float
    convergence: List[float]
    trainingTime: float
    inferenceTime: float
    steps: int
    modelPath: Optional[str] = None


class GNNTrainingRequest(BaseModel):
    cells: List[Cell]
    nets: List[Net]
    chipWidth: float
    chipHeight: float
    epochs: int = 100
    learningRate: float = 0.001
    hiddenDim: int = 64
    numLayers: int = 3


class InferenceRequest(BaseModel):
    algorithm: str
    modelPath: str
    cells: List[Cell]
    nets: List[Net]
    chipWidth: float
    chipHeight: float


# ============================================================================
# Health Check
# ============================================================================

@app.get("/")
def root():
    return {
        "status": "healthy",
        "message": "AI Chip Design ML Backend",
        "device": str(device),
        "pytorch_version": torch.__version__,
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "device": str(device),
    }


# ============================================================================
# DQN Endpoints
# ============================================================================

@app.post("/api/rl/train/dqn", response_model=RLTrainingResponse)
async def train_dqn(request: RLTrainingRequest):
    """Train DQN agent for chip placement"""
    try:
        logger.info(f"Starting DQN training with {request.episodes} episodes")

        # Initialize DQN agent
        state_size = 101  # Grid state + cell count
        action_size = 100

        agent = DQNAgent(
            state_size=state_size,
            action_size=action_size,
            learning_rate=request.learningRate,
            gamma=request.discountFactor,
            epsilon=request.epsilon,
            device=device
        )

        # Load pretrained if requested
        if request.usePretrained:
            checkpoint = checkpoint_manager.load("dqn_latest")
            if checkpoint:
                agent.load_state_dict(checkpoint['model_state'])

        # Train agent
        result = training_manager.train_dqn(
            agent=agent,
            cells=[c.dict() for c in request.cells],
            nets=[n.dict() for n in request.nets],
            chip_width=request.chipWidth,
            chip_height=request.chipHeight,
            episodes=request.episodes,
            batch_size=request.batchSize
        )

        # Save checkpoint
        model_path = checkpoint_manager.save(
            "dqn_latest",
            {
                'model_state': agent.state_dict(),
                'episode': request.episodes,
                'reward': result['totalReward']
            }
        )

        result['modelPath'] = model_path
        logger.info(f"DQN training complete. Model saved to {model_path}")

        return RLTrainingResponse(**result)

    except Exception as e:
        logger.error(f"DQN training failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Policy Gradient Endpoints
# ============================================================================

@app.post("/api/rl/train/policy-gradient", response_model=RLTrainingResponse)
async def train_policy_gradient(request: RLTrainingRequest):
    """Train Policy Gradient agent"""
    try:
        logger.info(f"Starting Policy Gradient training with {request.episodes} episodes")

        state_size = 101
        action_size = 100

        agent = PolicyGradientAgent(
            state_size=state_size,
            action_size=action_size,
            learning_rate=request.learningRate,
            gamma=request.discountFactor,
            device=device
        )

        if request.usePretrained:
            checkpoint = checkpoint_manager.load("pg_latest")
            if checkpoint:
                agent.load_state_dict(checkpoint['model_state'])

        result = training_manager.train_policy_gradient(
            agent=agent,
            cells=[c.dict() for c in request.cells],
            nets=[n.dict() for n in request.nets],
            chip_width=request.chipWidth,
            chip_height=request.chipHeight,
            episodes=request.episodes
        )

        model_path = checkpoint_manager.save(
            "pg_latest",
            {
                'model_state': agent.state_dict(),
                'episode': request.episodes,
                'reward': result['totalReward']
            }
        )

        result['modelPath'] = model_path
        return RLTrainingResponse(**result)

    except Exception as e:
        logger.error(f"Policy Gradient training failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Actor-Critic Endpoints
# ============================================================================

@app.post("/api/rl/train/actor-critic", response_model=RLTrainingResponse)
async def train_actor_critic(request: RLTrainingRequest):
    """Train Actor-Critic agent"""
    try:
        logger.info(f"Starting Actor-Critic training with {request.episodes} episodes")

        state_size = 101
        action_size = 100

        agent = ActorCriticAgent(
            state_size=state_size,
            action_size=action_size,
            learning_rate=request.learningRate,
            gamma=request.discountFactor,
            device=device
        )

        if request.usePretrained:
            checkpoint = checkpoint_manager.load("ac_latest")
            if checkpoint:
                agent.load_state_dict(checkpoint['model_state'])

        result = training_manager.train_actor_critic(
            agent=agent,
            cells=[c.dict() for c in request.cells],
            nets=[n.dict() for n in request.nets],
            chip_width=request.chipWidth,
            chip_height=request.chipHeight,
            episodes=request.episodes
        )

        model_path = checkpoint_manager.save(
            "ac_latest",
            {
                'model_state': agent.state_dict(),
                'episode': request.episodes,
                'reward': result['totalReward']
            }
        )

        result['modelPath'] = model_path
        return RLTrainingResponse(**result)

    except Exception as e:
        logger.error(f"Actor-Critic training failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PPO Endpoints
# ============================================================================

@app.post("/api/rl/train/ppo", response_model=RLTrainingResponse)
async def train_ppo(request: RLTrainingRequest):
    """Train PPO agent"""
    try:
        logger.info(f"Starting PPO training with {request.episodes} episodes")

        state_size = 101
        action_size = 100

        agent = PPOAgent(
            state_size=state_size,
            action_size=action_size,
            learning_rate=request.learningRate,
            gamma=request.discountFactor,
            epsilon_clip=0.2,
            device=device
        )

        if request.usePretrained:
            checkpoint = checkpoint_manager.load("ppo_latest")
            if checkpoint:
                agent.load_state_dict(checkpoint['model_state'])

        result = training_manager.train_ppo(
            agent=agent,
            cells=[c.dict() for c in request.cells],
            nets=[n.dict() for n in request.nets],
            chip_width=request.chipWidth,
            chip_height=request.chipHeight,
            episodes=request.episodes,
            batch_size=request.batchSize
        )

        model_path = checkpoint_manager.save(
            "ppo_latest",
            {
                'model_state': agent.state_dict(),
                'episode': request.episodes,
                'reward': result['totalReward']
            }
        )

        result['modelPath'] = model_path
        return RLTrainingResponse(**result)

    except Exception as e:
        logger.error(f"PPO training failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GNN Endpoints
# ============================================================================

@app.post("/api/ml/train/gnn")
async def train_gnn(request: GNNTrainingRequest):
    """Train Graph Neural Network for circuit topology"""
    try:
        logger.info(f"Starting GNN training with {request.epochs} epochs")

        # Build circuit graph
        from utils.graph_builder import build_circuit_graph
        graph_data = build_circuit_graph(
            cells=[c.dict() for c in request.cells],
            nets=[n.dict() for n in request.nets]
        )

        # Initialize GNN
        gnn = GraphNeuralNetwork(
            input_dim=graph_data['num_features'],
            hidden_dim=request.hiddenDim,
            output_dim=2,  # x, y coordinates
            num_layers=request.numLayers,
            device=device
        )

        # Train GNN
        result = training_manager.train_gnn(
            model=gnn,
            graph_data=graph_data,
            epochs=request.epochs,
            learning_rate=request.learningRate
        )

        # Save model
        model_path = checkpoint_manager.save(
            "gnn_latest",
            {
                'model_state': gnn.state_dict(),
                'epoch': request.epochs,
                'loss': result['final_loss']
            }
        )

        result['modelPath'] = model_path
        return result

    except Exception as e:
        logger.error(f"GNN training failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Inference Endpoints
# ============================================================================

@app.post("/api/rl/inference")
async def inference(request: InferenceRequest):
    """Run inference with trained model"""
    try:
        # Load checkpoint
        checkpoint = checkpoint_manager.load(request.modelPath)
        if not checkpoint:
            raise HTTPException(status_code=404, detail="Model not found")

        # Initialize agent based on algorithm
        state_size = 101
        action_size = 100

        if request.algorithm == "dqn":
            agent = DQNAgent(state_size, action_size, device=device)
        elif request.algorithm == "policy_gradient":
            agent = PolicyGradientAgent(state_size, action_size, device=device)
        elif request.algorithm == "actor_critic":
            agent = ActorCriticAgent(state_size, action_size, device=device)
        elif request.algorithm == "ppo":
            agent = PPOAgent(state_size, action_size, device=device)
        else:
            raise HTTPException(status_code=400, detail="Unknown algorithm")

        agent.load_state_dict(checkpoint['model_state'])

        # Run inference
        result = training_manager.run_inference(
            agent=agent,
            cells=[c.dict() for c in request.cells],
            nets=[n.dict() for n in request.nets],
            chip_width=request.chipWidth,
            chip_height=request.chipHeight
        )

        return result

    except Exception as e:
        logger.error(f"Inference failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Model Management
# ============================================================================

@app.get("/api/models/list")
async def list_models():
    """List all saved models"""
    try:
        models = checkpoint_manager.list_checkpoints()
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/models/{model_name}")
async def delete_model(model_name: str):
    """Delete a saved model"""
    try:
        success = checkpoint_manager.delete(model_name)
        if success:
            return {"status": "success", "message": f"Model {model_name} deleted"}
        else:
            raise HTTPException(status_code=404, detail="Model not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
