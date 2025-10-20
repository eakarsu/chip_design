"""
Deep Q-Network (DQN) Agent with Experience Replay and Target Network
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import List, Tuple
from collections import deque
import random


class QNetwork(nn.Module):
    """Q-Network for DQN"""

    def __init__(self, state_size: int, action_size: int, hidden_size: int = 128):
        super(QNetwork, self).__init__()

        self.network = nn.Sequential(
            nn.Linear(state_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, action_size)
        )

    def forward(self, state):
        return self.network(state)


class ReplayBuffer:
    """Experience Replay Buffer"""

    def __init__(self, capacity: int = 10000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size: int):
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)

        return (
            np.array(states),
            np.array(actions),
            np.array(rewards),
            np.array(next_states),
            np.array(dones)
        )

    def __len__(self):
        return len(self.buffer)


class DQNAgent:
    """DQN Agent with Target Network"""

    def __init__(
        self,
        state_size: int,
        action_size: int,
        learning_rate: float = 0.001,
        gamma: float = 0.99,
        epsilon: float = 1.0,
        epsilon_min: float = 0.01,
        epsilon_decay: float = 0.995,
        buffer_size: int = 10000,
        batch_size: int = 32,
        target_update_freq: int = 10,
        device: torch.device = None
    ):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay
        self.batch_size = batch_size
        self.target_update_freq = target_update_freq
        self.update_counter = 0

        self.device = device if device else torch.device("cpu")

        # Q-Networks
        self.q_network = QNetwork(state_size, action_size).to(self.device)
        self.target_network = QNetwork(state_size, action_size).to(self.device)
        self.target_network.load_state_dict(self.q_network.state_dict())

        # Optimizer
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)

        # Replay buffer
        self.memory = ReplayBuffer(buffer_size)

    def select_action(self, state: np.ndarray, available_actions: List[int], training: bool = True):
        """Epsilon-greedy action selection"""
        if training and random.random() < self.epsilon:
            return random.choice(available_actions)

        with torch.no_grad():
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
            q_values = self.q_network(state_tensor).cpu().numpy()[0]

            # Mask invalid actions
            masked_q = np.full(self.action_size, -np.inf)
            masked_q[available_actions] = q_values[available_actions]

            return np.argmax(masked_q)

    def remember(self, state, action, reward, next_state, done):
        """Store experience in replay buffer"""
        self.memory.push(state, action, reward, next_state, done)

    def train_step(self):
        """Perform one training step"""
        if len(self.memory) < self.batch_size:
            return 0.0

        # Sample batch
        states, actions, rewards, next_states, dones = self.memory.sample(self.batch_size)

        # Convert to tensors
        states = torch.FloatTensor(states).to(self.device)
        actions = torch.LongTensor(actions).to(self.device)
        rewards = torch.FloatTensor(rewards).to(self.device)
        next_states = torch.FloatTensor(next_states).to(self.device)
        dones = torch.FloatTensor(dones).to(self.device)

        # Current Q-values
        current_q = self.q_network(states).gather(1, actions.unsqueeze(1)).squeeze(1)

        # Target Q-values using target network
        with torch.no_grad():
            next_q = self.target_network(next_states).max(1)[0]
            target_q = rewards + (1 - dones) * self.gamma * next_q

        # Compute loss
        loss = nn.MSELoss()(current_q, target_q)

        # Optimize
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_network.parameters(), 1.0)
        self.optimizer.step()

        # Update target network
        self.update_counter += 1
        if self.update_counter % self.target_update_freq == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())

        # Decay epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

        return loss.item()

    def state_dict(self):
        """Get state dictionary for saving"""
        return {
            'q_network': self.q_network.state_dict(),
            'target_network': self.target_network.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'epsilon': self.epsilon
        }

    def load_state_dict(self, state_dict):
        """Load state dictionary"""
        self.q_network.load_state_dict(state_dict['q_network'])
        self.target_network.load_state_dict(state_dict['target_network'])
        self.optimizer.load_state_dict(state_dict['optimizer'])
        self.epsilon = state_dict.get('epsilon', self.epsilon)


class DoubleDQNAgent(DQNAgent):
    """Double DQN variant to reduce overestimation"""

    def train_step(self):
        """Training with Double DQN update"""
        if len(self.memory) < self.batch_size:
            return 0.0

        states, actions, rewards, next_states, dones = self.memory.sample(self.batch_size)

        states = torch.FloatTensor(states).to(self.device)
        actions = torch.LongTensor(actions).to(self.device)
        rewards = torch.FloatTensor(rewards).to(self.device)
        next_states = torch.FloatTensor(next_states).to(self.device)
        dones = torch.FloatTensor(dones).to(self.device)

        current_q = self.q_network(states).gather(1, actions.unsqueeze(1)).squeeze(1)

        # Double DQN: use online network to select action, target network to evaluate
        with torch.no_grad():
            next_actions = self.q_network(next_states).max(1)[1]
            next_q = self.target_network(next_states).gather(1, next_actions.unsqueeze(1)).squeeze(1)
            target_q = rewards + (1 - dones) * self.gamma * next_q

        loss = nn.MSELoss()(current_q, target_q)

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_network.parameters(), 1.0)
        self.optimizer.step()

        self.update_counter += 1
        if self.update_counter % self.target_update_freq == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())

        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

        return loss.item()


class DuelingDQNAgent(DQNAgent):
    """Dueling DQN architecture"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Replace networks with dueling architecture
        self.q_network = DuelingQNetwork(self.state_size, self.action_size).to(self.device)
        self.target_network = DuelingQNetwork(self.state_size, self.action_size).to(self.device)
        self.target_network.load_state_dict(self.q_network.state_dict())

        self.optimizer = optim.Adam(self.q_network.parameters(), lr=0.001)


class DuelingQNetwork(nn.Module):
    """Dueling Q-Network architecture"""

    def __init__(self, state_size: int, action_size: int, hidden_size: int = 128):
        super(DuelingQNetwork, self).__init__()

        # Shared feature extractor
        self.feature_layer = nn.Sequential(
            nn.Linear(state_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2)
        )

        # Value stream
        self.value_stream = nn.Sequential(
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Linear(hidden_size // 2, 1)
        )

        # Advantage stream
        self.advantage_stream = nn.Sequential(
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Linear(hidden_size // 2, action_size)
        )

    def forward(self, state):
        features = self.feature_layer(state)
        value = self.value_stream(features)
        advantage = self.advantage_stream(features)

        # Combine value and advantage: Q = V + (A - mean(A))
        q_values = value + (advantage - advantage.mean(dim=1, keepdim=True))

        return q_values
