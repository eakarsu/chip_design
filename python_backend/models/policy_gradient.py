"""
Policy Gradient (REINFORCE) Agent
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import List, Tuple


class PolicyNetwork(nn.Module):
    """Policy Network for REINFORCE"""

    def __init__(self, state_size: int, action_size: int, hidden_size: int = 128):
        super(PolicyNetwork, self).__init__()

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
        """
        Returns logits for each action
        """
        return self.network(state)

    def get_action_probs(self, state):
        """
        Returns action probabilities using softmax
        """
        logits = self.forward(state)
        return torch.softmax(logits, dim=-1)


class PolicyGradientAgent:
    """REINFORCE Policy Gradient Agent"""

    def __init__(
        self,
        state_size: int,
        action_size: int,
        learning_rate: float = 0.001,
        gamma: float = 0.99,
        device: torch.device = None
    ):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma

        self.device = device if device else torch.device("cpu")

        # Policy network
        self.policy = PolicyNetwork(state_size, action_size).to(self.device)

        # Optimizer
        self.optimizer = optim.Adam(self.policy.parameters(), lr=learning_rate)

        # Episode storage
        self.reset_episode()

    def reset_episode(self):
        """Reset episode storage"""
        self.saved_log_probs = []
        self.rewards = []

    def select_action(self, state: np.ndarray, available_actions: List[int], training: bool = True):
        """
        Select action from policy distribution
        """
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)

        with torch.no_grad() if not training else torch.enable_grad():
            action_probs = self.policy.get_action_probs(state_tensor)

        # Mask invalid actions
        mask = torch.zeros(self.action_size, device=self.device)
        mask[available_actions] = 1.0
        masked_probs = action_probs * mask
        masked_probs = masked_probs / masked_probs.sum()

        # Sample action
        dist = torch.distributions.Categorical(masked_probs)
        action = dist.sample()

        if training:
            # Save log probability for training
            self.saved_log_probs.append(dist.log_prob(action))

        return action.item()

    def store_reward(self, reward: float):
        """Store reward for current timestep"""
        self.rewards.append(reward)

    def train_step(self):
        """
        Perform REINFORCE update
        """
        if len(self.rewards) == 0:
            return 0.0

        # Calculate discounted returns
        returns = []
        G = 0
        for reward in reversed(self.rewards):
            G = reward + self.gamma * G
            returns.insert(0, G)

        returns = torch.tensor(returns, device=self.device)

        # Normalize returns
        returns = (returns - returns.mean()) / (returns.std() + 1e-8)

        # Calculate policy loss
        policy_loss = []
        for log_prob, G in zip(self.saved_log_probs, returns):
            policy_loss.append(-log_prob * G)

        # Optimize
        self.optimizer.zero_grad()
        loss = torch.stack(policy_loss).sum()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.policy.parameters(), 1.0)
        self.optimizer.step()

        # Reset episode
        loss_value = loss.item()
        self.reset_episode()

        return loss_value

    def state_dict(self):
        """Get state dictionary for saving"""
        return {
            'policy': self.policy.state_dict(),
            'optimizer': self.optimizer.state_dict()
        }

    def load_state_dict(self, state_dict):
        """Load state dictionary"""
        self.policy.load_state_dict(state_dict['policy'])
        self.optimizer.load_state_dict(state_dict['optimizer'])
