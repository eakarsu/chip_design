"""
Actor-Critic Agent
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import List


class ActorNetwork(nn.Module):
    """Actor network for policy"""

    def __init__(self, state_size: int, action_size: int, hidden_size: int = 128):
        super(ActorNetwork, self).__init__()

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

    def get_action_probs(self, state):
        logits = self.forward(state)
        return torch.softmax(logits, dim=-1)


class CriticNetwork(nn.Module):
    """Critic network for value function"""

    def __init__(self, state_size: int, hidden_size: int = 128):
        super(CriticNetwork, self).__init__()

        self.network = nn.Sequential(
            nn.Linear(state_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, 1)
        )

    def forward(self, state):
        return self.network(state)


class ActorCriticAgent:
    """Actor-Critic Agent with advantage estimation"""

    def __init__(
        self,
        state_size: int,
        action_size: int,
        learning_rate: float = 0.001,
        gamma: float = 0.99,
        value_loss_coef: float = 0.5,
        entropy_coef: float = 0.01,
        device: torch.device = None
    ):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma
        self.value_loss_coef = value_loss_coef
        self.entropy_coef = entropy_coef

        self.device = device if device else torch.device("cpu")

        # Actor and Critic networks
        self.actor = ActorNetwork(state_size, action_size).to(self.device)
        self.critic = CriticNetwork(state_size).to(self.device)

        # Optimizers
        self.actor_optimizer = optim.Adam(self.actor.parameters(), lr=learning_rate)
        self.critic_optimizer = optim.Adam(self.critic.parameters(), lr=learning_rate)

        # Episode storage
        self.reset_episode()

    def reset_episode(self):
        """Reset episode storage"""
        self.saved_log_probs = []
        self.values = []
        self.rewards = []
        self.entropies = []

    def select_action(self, state: np.ndarray, available_actions: List[int], training: bool = True):
        """Select action using actor network"""
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)

        with torch.no_grad() if not training else torch.enable_grad():
            # Get action probabilities
            action_probs = self.actor.get_action_probs(state_tensor)

            # Get state value
            value = self.critic(state_tensor)

        # Mask invalid actions
        mask = torch.zeros(self.action_size, device=self.device)
        mask[available_actions] = 1.0
        masked_probs = action_probs * mask
        masked_probs = masked_probs / masked_probs.sum()

        # Sample action
        dist = torch.distributions.Categorical(masked_probs)
        action = dist.sample()

        if training:
            # Save for training
            self.saved_log_probs.append(dist.log_prob(action))
            self.values.append(value)
            self.entropies.append(dist.entropy())

        return action.item()

    def store_reward(self, reward: float):
        """Store reward"""
        self.rewards.append(reward)

    def train_step(self):
        """Perform Actor-Critic update"""
        if len(self.rewards) == 0:
            return 0.0, 0.0

        # Calculate returns and advantages
        returns = []
        advantages = []
        G = 0

        for i in reversed(range(len(self.rewards))):
            G = self.rewards[i] + self.gamma * G
            returns.insert(0, G)

        returns = torch.tensor(returns, device=self.device)
        values = torch.cat(self.values).squeeze()

        # Normalize returns
        returns = (returns - returns.mean()) / (returns.std() + 1e-8)

        # Calculate advantages (TD error)
        advantages = returns - values.detach()

        # Actor loss (policy gradient with advantage)
        actor_loss = []
        for log_prob, advantage in zip(self.saved_log_probs, advantages):
            actor_loss.append(-log_prob * advantage)

        # Entropy bonus for exploration
        entropy_loss = -self.entropy_coef * torch.stack(self.entropies).mean()

        # Critic loss (MSE between predicted value and return)
        critic_loss = nn.MSELoss()(values, returns)

        # Total actor loss
        total_actor_loss = torch.stack(actor_loss).mean() + entropy_loss

        # Optimize actor
        self.actor_optimizer.zero_grad()
        total_actor_loss.backward()
        torch.nn.utils.clip_grad_norm_(self.actor.parameters(), 1.0)
        self.actor_optimizer.step()

        # Optimize critic
        self.critic_optimizer.zero_grad()
        critic_loss.backward()
        torch.nn.utils.clip_grad_norm_(self.critic.parameters(), 1.0)
        self.critic_optimizer.step()

        # Store losses
        actor_loss_value = total_actor_loss.item()
        critic_loss_value = critic_loss.item()

        # Reset episode
        self.reset_episode()

        return actor_loss_value, critic_loss_value

    def state_dict(self):
        """Get state dictionary"""
        return {
            'actor': self.actor.state_dict(),
            'critic': self.critic.state_dict(),
            'actor_optimizer': self.actor_optimizer.state_dict(),
            'critic_optimizer': self.critic_optimizer.state_dict()
        }

    def load_state_dict(self, state_dict):
        """Load state dictionary"""
        self.actor.load_state_dict(state_dict['actor'])
        self.critic.load_state_dict(state_dict['critic'])
        self.actor_optimizer.load_state_dict(state_dict['actor_optimizer'])
        self.critic_optimizer.load_state_dict(state_dict['critic_optimizer'])
