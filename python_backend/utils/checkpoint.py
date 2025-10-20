"""
Model Checkpoint Manager
Handles saving and loading of trained models
"""

import torch
import os
import json
from pathlib import Path
from typing import Dict, Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class CheckpointManager:
    """Manages model checkpoints"""

    def __init__(self, checkpoint_dir: str = "./checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Checkpoint directory: {self.checkpoint_dir}")

    def save(
        self,
        name: str,
        checkpoint: Dict,
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Save model checkpoint

        Args:
            name: Checkpoint name
            checkpoint: Checkpoint dictionary (model state, optimizer state, etc.)
            metadata: Additional metadata to save

        Returns:
            Path to saved checkpoint
        """
        try:
            # Create checkpoint path
            checkpoint_path = self.checkpoint_dir / f"{name}.pt"

            # Add metadata
            if metadata:
                checkpoint['metadata'] = metadata

            # Add timestamp
            checkpoint['timestamp'] = datetime.now().isoformat()

            # Save checkpoint
            torch.save(checkpoint, checkpoint_path)

            # Save metadata separately as JSON for easy inspection
            metadata_path = self.checkpoint_dir / f"{name}_metadata.json"
            with open(metadata_path, 'w') as f:
                json.dump({
                    'name': name,
                    'timestamp': checkpoint['timestamp'],
                    'metadata': checkpoint.get('metadata', {}),
                    'episode': checkpoint.get('episode', 0),
                    'reward': checkpoint.get('reward', 0)
                }, f, indent=2)

            logger.info(f"Checkpoint saved: {checkpoint_path}")
            return str(checkpoint_path)

        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            raise

    def load(
        self,
        name: str,
        device: Optional[torch.device] = None
    ) -> Optional[Dict]:
        """
        Load model checkpoint

        Args:
            name: Checkpoint name or path
            device: Device to load checkpoint to

        Returns:
            Checkpoint dictionary or None if not found
        """
        try:
            # Check if it's a path or name
            if os.path.isfile(name):
                checkpoint_path = Path(name)
            else:
                checkpoint_path = self.checkpoint_dir / f"{name}.pt"

            if not checkpoint_path.exists():
                logger.warning(f"Checkpoint not found: {checkpoint_path}")
                return None

            # Load checkpoint
            if device:
                checkpoint = torch.load(checkpoint_path, map_location=device)
            else:
                checkpoint = torch.load(checkpoint_path)

            logger.info(f"Checkpoint loaded: {checkpoint_path}")
            return checkpoint

        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            return None

    def list_checkpoints(self) -> List[Dict]:
        """
        List all available checkpoints

        Returns:
            List of checkpoint metadata dictionaries
        """
        checkpoints = []

        for metadata_file in self.checkpoint_dir.glob("*_metadata.json"):
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                    checkpoints.append(metadata)
            except Exception as e:
                logger.error(f"Error reading metadata {metadata_file}: {e}")

        # Sort by timestamp
        checkpoints.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

        return checkpoints

    def delete(self, name: str) -> bool:
        """
        Delete checkpoint

        Args:
            name: Checkpoint name

        Returns:
            True if successful, False otherwise
        """
        try:
            checkpoint_path = self.checkpoint_dir / f"{name}.pt"
            metadata_path = self.checkpoint_dir / f"{name}_metadata.json"

            deleted = False

            if checkpoint_path.exists():
                checkpoint_path.unlink()
                deleted = True

            if metadata_path.exists():
                metadata_path.unlink()
                deleted = True

            if deleted:
                logger.info(f"Checkpoint deleted: {name}")
                return True
            else:
                logger.warning(f"Checkpoint not found: {name}")
                return False

        except Exception as e:
            logger.error(f"Failed to delete checkpoint: {e}")
            return False

    def get_latest(self, prefix: str = "") -> Optional[str]:
        """
        Get most recent checkpoint

        Args:
            prefix: Optional prefix to filter checkpoints

        Returns:
            Name of latest checkpoint or None
        """
        checkpoints = self.list_checkpoints()

        if prefix:
            checkpoints = [c for c in checkpoints if c['name'].startswith(prefix)]

        if checkpoints:
            return checkpoints[0]['name']

        return None

    def get_best(
        self,
        metric: str = 'reward',
        maximize: bool = True
    ) -> Optional[str]:
        """
        Get checkpoint with best metric value

        Args:
            metric: Metric name to compare
            maximize: True to get maximum, False for minimum

        Returns:
            Name of best checkpoint or None
        """
        checkpoints = self.list_checkpoints()

        if not checkpoints:
            return None

        # Filter checkpoints that have the metric
        valid_checkpoints = [
            c for c in checkpoints
            if metric in c.get('metadata', {}) or metric in c
        ]

        if not valid_checkpoints:
            return None

        # Sort by metric
        valid_checkpoints.sort(
            key=lambda x: x.get('metadata', {}).get(metric, x.get(metric, 0)),
            reverse=maximize
        )

        return valid_checkpoints[0]['name']
