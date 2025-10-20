"""
Proximal Policy Optimization (PPO) Agent
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import List
from collections import deque


class ActorCriticNetwork(nn.Module):
    """Shared network for actor and critic"""

    def __init__(self, state_size: int, action_size: int, hidden_size: int = 128):
        super(ActorCriticNetwork, self).__init__()

        # Shared feature extractor
        self.shared = nn.Sequential(
            nn.Linear(state_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2)
        )

        # Actor head (policy)
        self.actor = nn.Linear(hidden_size, action_size)

        # Critic head (value)
        self.critic = nn.Linear(hidden_size, 1)

    def forward(self, state):
        """Forward pass returns both policy logits and value"""
        features = self.shared(state)
        logits = self.actor(features)
        value = self.critic(features)
        return logits, value

    def get_action_probs_and_value(self, state):
        """Get action probabilities and value estimate"""
        logits, value = self.forward(state)
        probs = torch.softmax(logits, dim=-1)
        return probs, value


class PPOAgent:
    """PPO Agent with clipped objective"""

    def __init__(
        self,
        state_size: int,
        action_size: int,
        learning_rate: float = 0.0003,
        gamma: float = 0.99,
        epsilon_clip: float = 0.2,
        value_loss_coef: float = 0.5,
        entropy_coef: float = 0.01,
        gae_lambda: float = 0.95,
        ppo_epochs: int = 4,
        batch_size: int = 64,
        device: torch.device = None
    ):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma
        self.epsilon_clip = epsilon_clip
        self.value_loss_coef = value_loss_coef
        self.entropy_coef = entropy_coef
        self.gae_lambda = gae_lambda
        self.ppo_epochs = ppo_epochs
        self.batch_size = batch_size

        self.device = device if device else torch.device("cpu")

        # Policy network
        self.policy = ActorCriticNetwork(state_size, action_size).to(self.device)

        # Optimizer
        self.optimizer = optim.Adam(self.policy.parameters(), lr=learning_rate)

        # Trajectory storage
        self.reset_trajectory()

    def reset_trajectory(self):
        """Reset trajectory buffer"""
        self.states = []
        self.actions = []
        self.rewards = []
        self.values = []
        self.log_probs = []
        self.dones = []

    def select_action(self, state: np.ndarray, available_actions: List[int], training: bool = True):
        """Select action using policy network"""
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)

        with torch.no_grad() if not training else torch.enable_grad():
            action_probs, value = self.policy.get_action_probs_and_value(state_tensor)

        # Mask invalid actions
        mask = torch.zeros(self.action_size, device=self.device)
        mask[available_actions] = 1.0
        masked_probs = action_probs * mask
        masked_probs = masked_probs / masked_probs.sum()

        # Sample action
        dist = torch.distributions.Categorical(masked_probs)
        action = dist.sample()

        if training:
            # Store trajectory data
            self.states.append(state)
            self.actions.append(action.item())
            self.values.append(value.item())
            self.log_probs.append(dist.log_prob(action).item())

        return action.item()

    def store_reward(self, reward: float, done: bool = False):
        """Store reward and done flag"""
        self.rewards.append(reward)
        self.dones.append(done)

    def compute_gae(self):
        """
        Compute Generalized Advantage Estimation (GAE)
        More stable advantage estimation with bias-variance tradeoff
        """
        advantages = []
        gae = 0

        # Convert to tensors
        values = self.values + [0]  # Bootstrap value

        for t in reversed(range(len(self.rewards))):
            # TD error: δ = r + γV(s') - V(s)
            delta = self.rewards[t] + self.gamma * values[t + 1] * (1 - self.dones[t]) - values[t]

            # GAE: A = δ + γλδ_{t+1} + (γλ)²δ_{t+2} + ...
            gae = delta + self.gamma * self.gae_lambda * (1 - self.dones[t]) * gae
            advantages.insert(0, gae)

        # Compute returns: A(s,a) + V(s)
        returns = [adv + val for adv, val in zip(advantages, self.values)]

        return advantages, returns

    def train_step(self):
        """Perform PPO update"""
        if len(self.states) == 0:
            return 0.0, 0.0, 0.0

        # Compute advantages and returns
        advantages, returns = self.compute_gae()

        # Convert to tensors
        states = torch.FloatTensor(np.array(self.states)).to(self.device)
        actions = torch.LongTensor(self.actions).to(self.device)
        old_log_probs = torch.FloatTensor(self.log_probs).to(self.device)
        advantages = torch.FloatTensor(advantages).to(self.device)
        returns = torch.FloatTensor(returns).to(self.device)

        # Normalize advantages
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # PPO update for multiple epochs
        total_policy_loss = 0.0
        total_value_loss = 0.0
        total_entropy = 0.0
        num_updates = 0

        for _ in range(self.ppo_epochs):
            # Get current policy predictions
            logits, values = self.policy(states)
            values = values.squeeze()

            # Calculate current log probabilities
            dist = torch.distributions.Categorical(logits=logits)
            curr_log_probs = dist.log_prob(actions)
            entropy = dist.entropy().mean()

            # Importance ratio: π(a|s) / π_old(a|s)
            ratio = torch.exp(curr_log_probs - old_log_probs)

            # Clipped surrogate objective
            surr1 = ratio * advantages
            surr2 = torch.clamp(ratio, 1 - self.epsilon_clip, 1 + self.epsilon_clip) * advantages
            policy_loss = -torch.min(surr1, surr2).mean()

            # Value loss
            value_loss = nn.MSELoss()(values, returns)

            # Total loss
            loss = policy_loss + self.value_loss_coef * value_loss - self.entropy_coef * entropy

            # Optimize
            self.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.policy.parameters(), 0.5)
            self.optimizer.step()

            total_policy_loss += policy_loss.item()
            total_value_loss += value_loss.item()
            total_entropy += entropy.item()
            num_updates += 1

        # Average losses
        avg_policy_loss = total_policy_loss / num_updates
        avg_value_loss = total_value_loss / num_updates
        avg_entropy = total_entropy / num_updates

        # Reset trajectory
        self.reset_trajectory()

        return avg_policy_loss, avg_value_loss, avg_entropy

    def state_dict(self):
        """Get state dictionary"""
        return {
            'policy': self.policy.state_dict(),
            'optimizer': self.optimizer.state_dict()
        }

    def load_state_dict(self, state_dict):
        """Load state dictionary"""
        self.policy.load_state_dict(state_dict['policy'])
        self.optimizer.load_state_dict(state_dict['optimizer'])


class PPOMemory:
    """Memory buffer for PPO with batching support"""

    def __init__(self):
        self.states = []
        self.actions = []
        self.rewards = []
        self.values = []
        self.log_probs = []
        self.dones = []

    def add(self, state, action, reward, value, log_prob, done):
        self.states.append(state)
        self.actions.append(action)
        self.rewards.append(reward)
        self.values.append(value)
        self.log_probs.append(log_prob)
        self.dones.append(done)

    def get(self):
        return (
            self.states,
            self.actions,
            self.rewards,
            self.values,
            self.log_probs,
            self.dones
        )

    def clear(self):
        self.states.clear()
        self.actions.clear()
        self.rewards.clear()
        self.values.clear()
        self.log_probs.clear()
        self.dones.clear()

    def __len__(self):
        return len(self.states)
