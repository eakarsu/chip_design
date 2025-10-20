# AI Chip Design Platform - ML/RL Implementation Guide

## Overview

This guide documents the comprehensive ML/RL implementation for the AI Chip Design Platform, including 5 RL algorithms, Graph Neural Networks, advanced ML infrastructure, and a production-grade Python backend.

---

## Table of Contents

1. [What's Been Implemented](#whats-been-implemented)
2. [Architecture Overview](#architecture-overview)
3. [RL Algorithms](#rl-algorithms)
4. [Graph Neural Networks](#graph-neural-networks)
5. [ML Infrastructure](#ml-infrastructure)
6. [Python Backend](#python-backend)
7. [Setup & Installation](#setup--installation)
8. [Usage Examples](#usage-examples)
9. [API Reference](#api-reference)
10. [Performance Tips](#performance-tips)

---

## What's Been Implemented

### ✅ Complete RL Algorithms (5 total)

| Algorithm | Location | Status | Description |
|-----------|----------|--------|-------------|
| **DQN** | `src/lib/algorithms/reinforcement.ts` | ✅ Complete | Deep Q-Network with experience replay |
| **Q-Learning** | `src/lib/algorithms/reinforcement.ts` | ✅ Complete | Tabular Q-learning |
| **Policy Gradient** | `src/lib/algorithms/reinforcement.ts` | ✅ Complete | REINFORCE algorithm |
| **Actor-Critic** | `src/lib/algorithms/reinforcement.ts` | ✅ Complete | A2C with advantage estimation |
| **PPO** | `src/lib/algorithms/reinforcement.ts` | ✅ Complete | Proximal Policy Optimization |

### ✅ Python Backend (PyTorch)

| Component | Location | Features |
|-----------|----------|----------|
| **FastAPI Server** | `python_backend/main.py` | REST API with CORS support |
| **DQN Agent** | `python_backend/models/dqn.py` | Experience replay, target network, Double DQN, Dueling DQN |
| **Policy Gradient** | `python_backend/models/policy_gradient.py` | REINFORCE with baseline |
| **Actor-Critic** | `python_backend/models/actor_critic.py` | Shared/separate networks, GAE support |
| **PPO Agent** | `python_backend/models/ppo.py` | Clipped objective, GAE, multiple epochs |
| **GNN Models** | `python_backend/models/gnn.py` | GCN, GAT, GraphSAGE architectures |

### ✅ ML Infrastructure

| Feature | Location | Description |
|---------|----------|-------------|
| **Experience Replay** | `src/lib/ml/infrastructure.ts` | Standard + Prioritized replay |
| **Target Networks** | `src/lib/ml/infrastructure.ts` | Hard + Soft updates |
| **Epsilon Scheduler** | `src/lib/ml/infrastructure.ts` | Linear + Exponential decay |
| **LR Scheduler** | `src/lib/ml/infrastructure.ts` | Step, Exponential, Cosine schedules |
| **Gradient Clipping** | `src/lib/ml/infrastructure.ts` | By norm + by value |
| **Reward Normalizer** | `src/lib/ml/infrastructure.ts` | Running mean/variance |
| **GAE Calculator** | `src/lib/ml/infrastructure.ts` | Generalized Advantage Estimation |
| **Multi-step Returns** | `src/lib/ml/infrastructure.ts` | N-step TD learning |
| **OU Noise** | `src/lib/ml/infrastructure.ts` | Ornstein-Uhlenbeck process |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  TypeScript RL (Browser)                             │  │
│  │  - DQN, Q-Learning, PG, A2C, PPO                     │  │
│  │  - Basic Neural Networks                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ HTTP/JSON                        │
│                          ▼                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │
┌─────────────────────────────────────────────────────────────┐
│                   Python Backend (FastAPI)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PyTorch RL Agents                                    │  │
│  │  - DQN with experience replay & target network        │  │
│  │  - Policy Gradient (REINFORCE)                        │  │
│  │  - Actor-Critic (A2C)                                 │  │
│  │  - PPO with GAE                                       │  │
│  │  - Graph Neural Networks (GCN, GAT, GraphSAGE)       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ML Infrastructure                                    │  │
│  │  - Experience Replay Buffer                           │  │
│  │  - Prioritized Replay                                 │  │
│  │  - Target Network Manager                             │  │
│  │  - Model Checkpointing                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  GPU Support: CUDA / CPU fallback                          │
└─────────────────────────────────────────────────────────────┘
```

---

## RL Algorithms

### 1. Deep Q-Network (DQN)

**Location:**
- TypeScript: `src/lib/algorithms/reinforcement.ts:251-429`
- Python: `python_backend/models/dqn.py`

**Features:**
- Experience replay buffer (10,000 transitions)
- Target network with periodic updates
- Epsilon-greedy exploration
- Double DQN variant
- Dueling DQN architecture

**Hyperparameters:**
```typescript
{
  episodes: 100,
  learningRate: 0.001,
  discountFactor: 0.99,
  epsilon: 0.1,
  batchSize: 32
}
```

**Use Case:** Best for discrete action spaces with large state spaces.

---

### 2. Policy Gradient (REINFORCE)

**Location:**
- TypeScript: `src/lib/algorithms/reinforcement.ts:766-938`
- Python: `python_backend/models/policy_gradient.py`

**Features:**
- Monte Carlo returns
- Baseline subtraction (return normalization)
- Stochastic policy sampling
- Gradient ascent

**Key Equations:**
```
∇J(θ) = E[∇log π(a|s) * G(t)]
G(t) = Σ γ^k * r_{t+k}
```

**Use Case:** Good for continuous and stochastic policies.

---

### 3. Actor-Critic (A2C)

**Location:**
- TypeScript: `src/lib/algorithms/reinforcement.ts:944-1158`
- Python: `python_backend/models/actor_critic.py`

**Features:**
- Separate actor (policy) and critic (value) networks
- TD error as advantage estimate
- Entropy regularization
- Lower variance than pure policy gradient

**Key Equations:**
```
Actor Loss: -E[log π(a|s) * A(s,a)]
Critic Loss: MSE(V(s), returns)
Advantage: A(s,a) = r + γV(s') - V(s)
```

**Use Case:** Balanced performance with moderate variance.

---

### 4. Proximal Policy Optimization (PPO)

**Location:**
- TypeScript: `src/lib/algorithms/reinforcement.ts:1164-1389`
- Python: `python_backend/models/ppo.py`

**Features:**
- Clipped surrogate objective
- Generalized Advantage Estimation (GAE)
- Multiple update epochs per episode
- Trust region optimization

**Key Equations:**
```
L^CLIP(θ) = E[min(r(θ)*A, clip(r(θ), 1±ε)*A)]
r(θ) = π_θ(a|s) / π_θ_old(a|s)
GAE: A_t = Σ (γλ)^k * δ_{t+k}
```

**Hyperparameters:**
```typescript
{
  epsilon: 0.2,        // Clip parameter
  ppoEpochs: 4,        // Update iterations
  gae_lambda: 0.95     // GAE parameter
}
```

**Use Case:** State-of-the-art for most tasks, very stable.

---

### 5. Q-Learning (Tabular)

**Location:** `src/lib/algorithms/reinforcement.ts:435-636`

**Features:**
- Simple tabular method
- No function approximation
- Guaranteed convergence for finite MDPs

**Use Case:** Small discrete state/action spaces, debugging.

---

## Graph Neural Networks

### Architecture Options

**Location:** `python_backend/models/gnn.py`

#### 1. Graph Convolutional Network (GCN)
```python
GNN(input_dim, hidden_dim=64, conv_type='gcn')
```
- Simple and fast
- Spectral graph convolutions
- Good for homogeneous graphs

#### 2. Graph Attention Network (GAT)
```python
GNN(input_dim, hidden_dim=64, conv_type='gat')
```
- Attention-based message passing
- Learns edge importance
- Best for heterogeneous circuits

#### 3. GraphSAGE
```python
GNN(input_dim, hidden_dim=64, conv_type='sage')
```
- Sampling + aggregation
- Scalable to large graphs
- Inductive learning

### Circuit Graph Representation

**Nodes:** Circuit cells (gates, macros, I/O pads)

**Node Features:**
```python
[
  width,           # Cell width
  height,          # Cell height
  num_pins,        # Number of pins
  is_standard,     # One-hot: standard cell
  is_macro,        # One-hot: macro block
  is_io            # One-hot: I/O pad
]
```

**Edges:** Created from nets (hyperedges converted to cliques)

**Edge Features:**
```python
[net_weight]  # Importance of connection
```

### Usage

```python
from models.gnn import CircuitGNN, build_circuit_graph

# Build graph
graph = build_circuit_graph(cells, nets)

# Create model
gnn = CircuitGNN(input_dim=6, hidden_dim=64, num_layers=3)

# Predict placements
positions = gnn(graph)  # Shape: [num_cells, 2] (x, y)
```

---

## ML Infrastructure

### Experience Replay

**Standard Replay Buffer:**
```typescript
import { ReplayBuffer } from '@/lib/ml/infrastructure';

const buffer = new ReplayBuffer(capacity: 10000);
buffer.add(experience);
const batch = buffer.sample(batchSize: 32);
```

**Prioritized Replay:**
```typescript
import { PrioritizedReplayBuffer } from '@/lib/ml/infrastructure';

const buffer = new PrioritizedReplayBuffer(
  capacity: 10000,
  alpha: 0.6,    // Priority exponent
  beta: 0.4      // Importance sampling
);

const { batch, indices, weights } = buffer.samplePrioritized(32);
buffer.updatePriorities(indices, tdErrors);
```

### Target Networks

```typescript
import { TargetNetworkManager } from '@/lib/ml/infrastructure';

const targetManager = new TargetNetworkManager(
  updateFrequency: 1000,
  tau: 0.005
);

targetManager.initialize(qNetwork);

// Hard update (copy entire network)
targetManager.hardUpdate(qNetwork);

// Soft update (polyak averaging)
targetManager.softUpdate(qNetwork);
```

### Schedulers

**Epsilon Decay:**
```typescript
const epsilonScheduler = new EpsilonScheduler(
  epsilonStart: 1.0,
  epsilonMin: 0.01,
  epsilonDecay: 0.995,
  decayType: 'exponential'
);

const epsilon = epsilonScheduler.getEpsilon();
epsilonScheduler.decay();
```

**Learning Rate Scheduling:**
```typescript
const lrScheduler = new LearningRateScheduler(
  lrStart: 0.001,
  lrMin: 0.00001,
  lrDecay: 0.99,
  scheduleType: 'cosine'
);
```

### Generalized Advantage Estimation (GAE)

```typescript
const gae = new GAE(gamma: 0.99, lambda: 0.95);
const advantages = gae.calculate(rewards, values, dones);
```

---

## Python Backend

### Setup & Installation

```bash
cd python_backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server
python main.py
```

Server will start at `http://localhost:8000`

### API Endpoints

#### Health Check
```bash
GET http://localhost:8000/health
```

#### Train DQN
```bash
POST http://localhost:8000/api/rl/train/dqn
Content-Type: application/json

{
  "algorithm": "dqn",
  "cells": [...],
  "nets": [...],
  "chipWidth": 1000,
  "chipHeight": 1000,
  "episodes": 100,
  "learningRate": 0.001,
  "discountFactor": 0.99,
  "epsilon": 0.1,
  "batchSize": 32,
  "usePretrained": false
}
```

#### Train Policy Gradient
```bash
POST http://localhost:8000/api/rl/train/policy-gradient
```

#### Train Actor-Critic
```bash
POST http://localhost:8000/api/rl/train/actor-critic
```

#### Train PPO
```bash
POST http://localhost:8000/api/rl/train/ppo
```

#### Train GNN
```bash
POST http://localhost:8000/api/ml/train/gnn

{
  "cells": [...],
  "nets": [...],
  "chipWidth": 1000,
  "chipHeight": 1000,
  "epochs": 100,
  "learningRate": 0.001,
  "hiddenDim": 64,
  "numLayers": 3
}
```

#### Inference
```bash
POST http://localhost:8000/api/rl/inference

{
  "algorithm": "ppo",
  "modelPath": "ppo_latest",
  "cells": [...],
  "nets": [...],
  "chipWidth": 1000,
  "chipHeight": 1000
}
```

#### List Models
```bash
GET http://localhost:8000/api/models/list
```

#### Delete Model
```bash
DELETE http://localhost:8000/api/models/{model_name}
```

---

## Usage Examples

### Example 1: Training PPO in TypeScript

```typescript
import { runRL } from '@/lib/algorithms/reinforcement';
import { RLAlgorithm } from '@/types/algorithms';

const result = runRL({
  algorithm: RLAlgorithm.PPO_FLOORPLANNING,
  cells: cells,
  nets: nets,
  chipWidth: 1000,
  chipHeight: 1000,
  episodes: 100,
  learningRate: 0.0003,
  discountFactor: 0.99,
  epsilon: 0.2
});

console.log('Final reward:', result.totalReward);
console.log('Wirelength:', result.wirelength);
console.log('Overlap:', result.overlap);
```

### Example 2: Using Python Backend from Frontend

```typescript
async function trainPPO() {
  const response = await fetch('http://localhost:8000/api/rl/train/ppo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      algorithm: 'ppo',
      cells: cells,
      nets: nets,
      chipWidth: 1000,
      chipHeight: 1000,
      episodes: 100,
      learningRate: 0.0003,
      discountFactor: 0.99,
      epsilon: 0.2,
      batchSize: 64
    })
  });

  const result = await response.json();
  console.log('Model saved to:', result.modelPath);
}
```

### Example 3: Training GNN for Placement

```python
from models.gnn import CircuitGNN, build_circuit_graph
import torch

# Build circuit graph
graph = build_circuit_graph(cells, nets)

# Initialize GNN
gnn = CircuitGNN(
    input_dim=6,
    hidden_dim=64,
    num_layers=3
).to(device)

# Training loop
optimizer = torch.optim.Adam(gnn.parameters(), lr=0.001)
criterion = torch.nn.MSELoss()

for epoch in range(100):
    optimizer.zero_grad()

    # Forward pass
    predicted_positions = gnn(graph)

    # Compute loss (e.g., wirelength-based)
    loss = criterion(predicted_positions, target_positions)

    # Backward pass
    loss.backward()
    optimizer.step()

    print(f'Epoch {epoch}, Loss: {loss.item()}')
```

---

## Performance Tips

### 1. Hardware Acceleration

**GPU Training (Python backend):**
```python
# Automatically uses CUDA if available
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
agent = PPOAgent(..., device=device)
```

### 2. Hyperparameter Tuning

**DQN:**
- Start with larger epsilon (0.5-1.0) for exploration
- Use target network updates every 100-1000 steps
- Replay buffer size: 10K-100K

**PPO:**
- Clip epsilon: 0.1-0.3
- PPO epochs: 3-10
- GAE lambda: 0.9-0.99
- Learning rate: 1e-4 to 3e-4

**Actor-Critic:**
- Learning rate: 1e-3 to 1e-4
- Entropy coefficient: 0.01-0.1
- Value loss coefficient: 0.5-1.0

### 3. Debugging

**Check convergence:**
```typescript
// Plot convergence data
result.convergence.forEach((avgReward, episode) => {
  console.log(`Episode ${episode + 10}: ${avgReward}`);
});
```

**Monitor losses:**
```python
# In training loop
if episode % 10 == 0:
    logger.info(f'Episode {episode}, Loss: {loss:.4f}')
```

### 4. Model Checkpointing

**Save best model:**
```python
if episode_reward > best_reward:
    checkpoint_manager.save(
        'ppo_best',
        {'model_state': agent.state_dict(), 'reward': episode_reward}
    )
```

---

## File Structure

```
chip_design/
├── src/
│   ├── lib/
│   │   ├── algorithms/
│   │   │   └── reinforcement.ts          # 5 RL algorithms (TS)
│   │   └── ml/
│   │       └── infrastructure.ts          # ML utilities
│   └── types/
│       └── algorithms.ts                  # Type definitions
│
├── python_backend/
│   ├── main.py                            # FastAPI server
│   ├── requirements.txt                   # Dependencies
│   ├── models/
│   │   ├── dqn.py                        # DQN + Double DQN + Dueling
│   │   ├── policy_gradient.py            # REINFORCE
│   │   ├── actor_critic.py               # A2C
│   │   ├── ppo.py                        # PPO
│   │   └── gnn.py                        # Graph Neural Networks
│   └── utils/
│       └── checkpoint.py                  # Model persistence
│
└── ML_RL_IMPLEMENTATION_GUIDE.md          # This file
```

---

## Next Steps

### Recommended Enhancements

1. **Add More GNN Architectures:**
   - EdgeConv for point clouds
   - GIN (Graph Isomorphism Network)
   - Transformer-based graph networks

2. **Advanced RL Algorithms:**
   - A3C (Asynchronous Actor-Critic)
   - DDPG (Deep Deterministic Policy Gradient)
   - SAC (Soft Actor-Critic)
   - TD3 (Twin Delayed DDPG)

3. **Transfer Learning:**
   - Pre-train on standard benchmarks (ISPD, DAC)
   - Fine-tune on specific designs

4. **Multi-Agent RL:**
   - Collaborative placement
   - Hierarchical RL for large designs

5. **Integration:**
   - Connect to commercial EDA tools
   - Support standard formats (DEF, LEF, Verilog)

---

## References

### Papers

1. **DQN:** Mnih et al. "Playing Atari with Deep Reinforcement Learning" (2013)
2. **PPO:** Schulman et al. "Proximal Policy Optimization Algorithms" (2017)
3. **GAE:** Schulman et al. "High-Dimensional Continuous Control Using Generalized Advantage Estimation" (2015)
4. **GNN for Circuits:** Mirhoseini et al. "A graph placement methodology for fast chip design" (Nature 2021)

### Resources

- [PyTorch Documentation](https://pytorch.org/docs/)
- [PyTorch Geometric](https://pytorch-geometric.readthedocs.io/)
- [Stable Baselines3](https://stable-baselines3.readthedocs.io/)
- [OpenAI Spinning Up](https://spinningup.openai.com/)

---

## Summary

You now have a **production-grade ML/RL system** with:

✅ **5 RL algorithms** (DQN, Q-Learning, Policy Gradient, Actor-Critic, PPO)
✅ **Graph Neural Networks** (GCN, GAT, GraphSAGE)
✅ **Advanced ML infrastructure** (replay buffers, target networks, schedulers)
✅ **Python backend** with PyTorch and FastAPI
✅ **Model checkpointing** and persistence
✅ **GPU support** for accelerated training
✅ **Comprehensive API** for training and inference

The system is ready for:
- Research experiments
- Production deployment
- Extension with new algorithms
- Integration with real chip design workflows

Happy chip designing! 🚀
