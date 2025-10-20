"""
Graph Neural Network for Circuit Topology Learning
Uses PyTorch Geometric for graph operations
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, GATConv, SAGEConv, global_mean_pool
from torch_geometric.data import Data, Batch
import numpy as np
from typing import List, Dict, Optional


class GraphNeuralNetwork(nn.Module):
    """
    GNN for learning circuit representations
    Supports multiple architectures: GCN, GAT, GraphSAGE
    """

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 64,
        output_dim: int = 2,
        num_layers: int = 3,
        conv_type: str = 'gcn',
        dropout: float = 0.2,
        device: torch.device = None
    ):
        super(GraphNeuralNetwork, self).__init__()

        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.num_layers = num_layers
        self.conv_type = conv_type
        self.dropout = dropout
        self.device = device if device else torch.device("cpu")

        # Input projection
        self.input_proj = nn.Linear(input_dim, hidden_dim)

        # Graph convolution layers
        self.convs = nn.ModuleList()
        self.batch_norms = nn.ModuleList()

        for i in range(num_layers):
            in_dim = hidden_dim
            out_dim = hidden_dim

            if conv_type == 'gcn':
                conv = GCNConv(in_dim, out_dim)
            elif conv_type == 'gat':
                conv = GATConv(in_dim, out_dim, heads=4, concat=False)
            elif conv_type == 'sage':
                conv = SAGEConv(in_dim, out_dim)
            else:
                raise ValueError(f"Unknown conv type: {conv_type}")

            self.convs.append(conv)
            self.batch_norms.append(nn.BatchNorm1d(out_dim))

        # Output layers
        self.output_layers = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, output_dim)
        )

    def forward(self, data):
        """
        Forward pass
        data: PyTorch Geometric Data object with x, edge_index, batch
        """
        x, edge_index = data.x, data.edge_index

        # Input projection
        x = self.input_proj(x)
        x = F.relu(x)

        # Graph convolutions
        for i, (conv, bn) in enumerate(zip(self.convs, self.batch_norms)):
            x_new = conv(x, edge_index)
            x_new = bn(x_new)
            x_new = F.relu(x_new)
            x_new = F.dropout(x_new, p=self.dropout, training=self.training)

            # Residual connection (if same dimension)
            if x_new.shape == x.shape:
                x = x + x_new
            else:
                x = x_new

        # Output
        out = self.output_layers(x)

        return out


class CircuitGNN(nn.Module):
    """
    Specialized GNN for circuit placement
    Predicts optimal (x, y) positions for cells
    """

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 64,
        num_layers: int = 3,
        device: torch.device = None
    ):
        super(CircuitGNN, self).__init__()

        self.device = device if device else torch.device("cpu")

        # Node embedding
        self.node_embedding = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim)
        )

        # GNN layers
        self.gnn_layers = nn.ModuleList([
            GATConv(hidden_dim, hidden_dim, heads=4, concat=False)
            for _ in range(num_layers)
        ])

        self.batch_norms = nn.ModuleList([
            nn.BatchNorm1d(hidden_dim) for _ in range(num_layers)
        ])

        # Position prediction head
        self.position_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, 2),  # (x, y) coordinates
            nn.Sigmoid()  # Normalize to [0, 1]
        )

    def forward(self, data):
        x, edge_index = data.x, data.edge_index

        # Node embedding
        x = self.node_embedding(x)

        # GNN layers with residual connections
        for gnn, bn in zip(self.gnn_layers, self.batch_norms):
            x_res = x
            x = gnn(x, edge_index)
            x = bn(x)
            x = F.relu(x)
            x = x + x_res  # Residual

        # Predict positions
        positions = self.position_head(x)

        return positions


class HierarchicalGNN(nn.Module):
    """
    Hierarchical GNN for multi-scale circuit analysis
    """

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 64,
        num_layers: int = 3,
        pool_ratios: List[float] = [0.5, 0.5],
        device: torch.device = None
    ):
        super(HierarchicalGNN, self).__init__()

        self.device = device if device else torch.device("cpu")

        # Initial convolutions
        self.initial_conv = GCNConv(input_dim, hidden_dim)

        # Hierarchical layers
        self.conv_layers = nn.ModuleList()
        for _ in range(num_layers):
            self.conv_layers.append(GCNConv(hidden_dim, hidden_dim))

        # Global pooling
        self.global_pool = global_mean_pool

        # Output
        self.output = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 2)
        )

    def forward(self, data):
        x, edge_index, batch = data.x, data.edge_index, data.batch

        # Initial convolution
        x = self.initial_conv(x, edge_index)
        x = F.relu(x)

        # Hierarchical convolutions
        for conv in self.conv_layers:
            x = conv(x, edge_index)
            x = F.relu(x)

        # Global pooling per graph in batch
        x = self.global_pool(x, batch)

        # Output
        out = self.output(x)

        return out


class GNNPlacementAgent:
    """
    GNN-based placement agent
    """

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 64,
        num_layers: int = 3,
        learning_rate: float = 0.001,
        device: torch.device = None
    ):
        self.device = device if device else torch.device("cpu")

        # Model
        self.model = CircuitGNN(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            num_layers=num_layers,
            device=self.device
        ).to(self.device)

        # Optimizer
        self.optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=learning_rate
        )

        # Loss function
        self.criterion = nn.MSELoss()

    def predict_positions(self, graph_data: Data):
        """Predict cell positions"""
        self.model.eval()
        with torch.no_grad():
            graph_data = graph_data.to(self.device)
            positions = self.model(graph_data)
        return positions.cpu().numpy()

    def train_step(self, graph_data: Data, target_positions: torch.Tensor):
        """Single training step"""
        self.model.train()

        graph_data = graph_data.to(self.device)
        target_positions = target_positions.to(self.device)

        # Forward pass
        predicted_positions = self.model(graph_data)

        # Compute loss
        loss = self.criterion(predicted_positions, target_positions)

        # Backward pass
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
        self.optimizer.step()

        return loss.item()

    def state_dict(self):
        """Get state dictionary"""
        return {
            'model': self.model.state_dict(),
            'optimizer': self.optimizer.state_dict()
        }

    def load_state_dict(self, state_dict):
        """Load state dictionary"""
        self.model.load_state_dict(state_dict['model'])
        self.optimizer.load_state_dict(state_dict['optimizer'])


def build_circuit_graph(
    cells: List[Dict],
    nets: List[Dict]
) -> Data:
    """
    Build PyTorch Geometric graph from circuit data

    Args:
        cells: List of cell dictionaries
        nets: List of net dictionaries

    Returns:
        PyTorch Geometric Data object
    """
    num_cells = len(cells)

    # Node features: [width, height, num_pins, cell_type_encoding]
    node_features = []
    for cell in cells:
        # Normalize dimensions
        width = cell['width']
        height = cell['height']
        num_pins = len(cell['pins'])

        # One-hot encode cell type
        type_encoding = [0, 0, 0]  # [standard, macro, io]
        if cell['type'] == 'standard':
            type_encoding[0] = 1
        elif cell['type'] == 'macro':
            type_encoding[1] = 1
        else:
            type_encoding[2] = 1

        features = [width, height, num_pins] + type_encoding
        node_features.append(features)

    x = torch.FloatTensor(node_features)

    # Edge index from nets (hyperedges -> pairwise edges)
    edge_index = []
    edge_weights = []

    for net in nets:
        # Get cells connected by this net
        cell_ids = []
        for pin_id in net['pins']:
            cell_id = pin_id.split('_')[0]
            # Find cell index
            for i, cell in enumerate(cells):
                if cell['id'] == cell_id:
                    cell_ids.append(i)
                    break

        # Create clique (fully connected) for cells in this net
        for i in range(len(cell_ids)):
            for j in range(i + 1, len(cell_ids)):
                edge_index.append([cell_ids[i], cell_ids[j]])
                edge_index.append([cell_ids[j], cell_ids[i]])  # Undirected
                edge_weights.extend([net['weight'], net['weight']])

    if len(edge_index) > 0:
        edge_index = torch.LongTensor(edge_index).t()
    else:
        edge_index = torch.empty((2, 0), dtype=torch.long)

    # Create Data object
    data = Data(
        x=x,
        edge_index=edge_index,
        num_nodes=num_cells
    )

    if len(edge_weights) > 0:
        data.edge_attr = torch.FloatTensor(edge_weights).unsqueeze(1)

    return data
