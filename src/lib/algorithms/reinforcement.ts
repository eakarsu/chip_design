import {
  RLParams,
  RLResult,
  RLAlgorithm,
  RLState,
  RLAction,
  RLExperience,
  Cell,
  Net,
  Point,
  Rectangle,
} from '@/types/algorithms';

// Neural Network approximator (simplified)
class NeuralNetwork {
  private weights: number[][][];
  private biases: number[][];
  private learningRate: number;

  constructor(inputSize: number, hiddenSize: number, outputSize: number, lr: number = 0.001) {
    this.learningRate = lr;

    // Initialize weights randomly (Xavier initialization)
    this.weights = [
      this.randomMatrix(inputSize, hiddenSize),
      this.randomMatrix(hiddenSize, outputSize),
    ];
    this.biases = [
      this.randomArray(hiddenSize),
      this.randomArray(outputSize),
    ];
  }

  private randomMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2.0 / rows);
    return Array(rows).fill(0).map(() =>
      Array(cols).fill(0).map(() => (Math.random() - 0.5) * 2 * scale)
    );
  }

  private randomArray(size: number): number[] {
    return Array(size).fill(0).map(() => (Math.random() - 0.5) * 0.1);
  }

  private relu(x: number): number {
    return Math.max(0, x);
  }

  private softmax(x: number[]): number[] {
    const maxVal = Math.max(...x);
    const exp = x.map(val => Math.exp(val - maxVal));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(val => val / sum);
  }

  forward(input: number[]): number[] {
    // Layer 1: input -> hidden
    const hidden = this.biases[0].slice();
    for (let i = 0; i < hidden.length; i++) {
      for (let j = 0; j < input.length; j++) {
        hidden[i] += input[j] * this.weights[0][j][i];
      }
      hidden[i] = this.relu(hidden[i]);
    }

    // Layer 2: hidden -> output
    const output = this.biases[1].slice();
    for (let i = 0; i < output.length; i++) {
      for (let j = 0; j < hidden.length; j++) {
        output[i] += hidden[j] * this.weights[1][j][i];
      }
    }

    return output;
  }

  update(input: number[], target: number[], actionIndex: number) {
    // Simple gradient descent (simplified backprop)
    const output = this.forward(input);
    const error = target[actionIndex] - output[actionIndex];

    // Update output layer weights (simplified)
    for (let i = 0; i < this.weights[1].length; i++) {
      for (let j = 0; j < this.weights[1][i].length; j++) {
        this.weights[1][i][j] += this.learningRate * error * 0.1;
      }
    }
  }
}

// Environment for chip placement
class ChipPlacementEnv {
  private cells: Cell[];
  private nets: Net[];
  private chipWidth: number;
  private chipHeight: number;
  private gridSize: number;
  private placedCells: Set<string>;

  constructor(cells: Cell[], nets: Net[], width: number, height: number) {
    this.cells = cells;
    this.nets = nets;
    this.chipWidth = width;
    this.chipHeight = height;
    this.gridSize = 10; // Discretize into 10x10 grid
    this.placedCells = new Set();
  }

  reset(): RLState {
    this.placedCells.clear();
    this.cells.forEach(cell => {
      cell.position = undefined;
    });

    return this.getState();
  }

  getState(): RLState {
    // Encode current placement as grid
    const gridState = Array(this.gridSize).fill(0).map(() =>
      Array(this.gridSize).fill(0)
    );

    for (const cell of this.cells) {
      if (cell.position) {
        const gridX = Math.floor((cell.position.x / this.chipWidth) * this.gridSize);
        const gridY = Math.floor((cell.position.y / this.chipHeight) * this.gridSize);
        if (gridX >= 0 && gridX < this.gridSize && gridY >= 0 && gridY < this.gridSize) {
          gridState[gridY][gridX] = 1;
        }
      }
    }

    // Flatten grid for neural network
    const observation = gridState.flat();

    // Add cell count features
    observation.push(this.placedCells.size / this.cells.length);

    // Available actions: place next unplaced cell in any grid position
    const availableActions: number[] = [];
    const nextCell = this.cells.find(c => !this.placedCells.has(c.id));
    if (nextCell) {
      for (let y = 0; y < this.gridSize; y++) {
        for (let x = 0; x < this.gridSize; x++) {
          if (gridState[y][x] === 0) {
            availableActions.push(y * this.gridSize + x);
          }
        }
      }
    }

    return {
      observation,
      gridState,
      availableActions,
    };
  }

  step(action: RLAction): { state: RLState; reward: number; done: boolean } {
    const nextCell = this.cells.find(c => !this.placedCells.has(c.id));

    if (!nextCell || !action.position) {
      return { state: this.getState(), reward: -10, done: true };
    }

    // Place the cell
    nextCell.position = action.position;
    this.placedCells.add(nextCell.id);

    // Calculate reward
    const reward = this.calculateReward();
    const done = this.placedCells.size === this.cells.length;

    return {
      state: this.getState(),
      reward,
      done,
    };
  }

  private calculateReward(): number {
    // Reward components
    let wirelengthPenalty = 0;
    let overlapPenalty = 0;

    // Calculate wirelength (HPWL)
    for (const net of this.nets) {
      const positions: Point[] = [];
      for (const pinId of net.pins) {
        const cellId = pinId.split('_')[0];
        const cell = this.cells.find(c => c.id === cellId);
        if (cell?.position) {
          const pin = cell.pins.find(p => p.id === pinId);
          if (pin) {
            positions.push({
              x: cell.position.x + pin.position.x,
              y: cell.position.y + pin.position.y,
            });
          }
        }
      }

      if (positions.length >= 2) {
        const minX = Math.min(...positions.map(p => p.x));
        const maxX = Math.max(...positions.map(p => p.x));
        const minY = Math.min(...positions.map(p => p.y));
        const maxY = Math.max(...positions.map(p => p.y));
        wirelengthPenalty += (maxX - minX + maxY - minY) * net.weight;
      }
    }

    // Calculate overlap
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const c1 = this.cells[i];
        const c2 = this.cells[j];

        if (c1.position && c2.position) {
          const overlapX = Math.max(
            0,
            Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
              Math.max(c1.position.x, c2.position.x)
          );
          const overlapY = Math.max(
            0,
            Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
              Math.max(c1.position.y, c2.position.y)
          );
          overlapPenalty += overlapX * overlapY;
        }
      }
    }

    // Normalize and combine
    const maxWirelength = this.chipWidth * this.chipHeight;
    const reward = -0.5 * (wirelengthPenalty / maxWirelength) - 5.0 * overlapPenalty;

    return reward;
  }

  getCells(): Cell[] {
    return this.cells;
  }
}

/**
 * Deep Q-Network (DQN) for Floorplanning
 * Google-style chip design approach
 */
export function dqnFloorplanning(params: RLParams): RLResult {
  const startTime = performance.now();
  const {
    cells,
    nets,
    chipWidth,
    chipHeight,
    episodes = 100,
    learningRate = 0.001,
    discountFactor = 0.99,
    epsilon = 0.1,
  } = params;

  const env = new ChipPlacementEnv(cells, nets, chipWidth, chipHeight);
  const stateSize = env.getState().observation.length;
  const actionSize = 100; // Grid positions

  const qNetwork = new NeuralNetwork(stateSize, 64, actionSize, learningRate);
  const episodeRewards: number[] = [];
  const convergenceData: number[] = [];

  // Training loop
  for (let episode = 0; episode < episodes; episode++) {
    let state = env.reset();
    let episodeReward = 0;
    let steps = 0;

    while (steps < cells.length) {
      // Epsilon-greedy action selection
      let actionIdx: number;
      if (Math.random() < epsilon) {
        // Random action
        actionIdx = state.availableActions[
          Math.floor(Math.random() * state.availableActions.length)
        ];
      } else {
        // Greedy action
        const qValues = qNetwork.forward(state.observation);
        const validQValues = state.availableActions.map(a => ({ a, q: qValues[a] }));
        actionIdx = validQValues.reduce((max, curr) =>
          curr.q > max.q ? curr : max
        ).a;
      }

      // Convert action index to position
      const gridX = actionIdx % 10;
      const gridY = Math.floor(actionIdx / 10);
      const position = {
        x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
        y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
      };

      const action: RLAction = {
        type: 'place',
        position,
      };

      // Take action
      const { state: nextState, reward, done } = env.step(action);
      episodeReward += reward;

      // Q-learning update
      const currentQ = qNetwork.forward(state.observation);
      const nextQ = qNetwork.forward(nextState.observation);
      const maxNextQ = Math.max(...nextQ);

      const target = currentQ.slice();
      target[actionIdx] = reward + discountFactor * maxNextQ * (done ? 0 : 1);

      qNetwork.update(state.observation, target, actionIdx);

      state = nextState;
      steps++;

      if (done) break;
    }

    episodeRewards.push(episodeReward);

    // Track convergence (moving average of last 10 episodes)
    if (episode >= 10) {
      const avg = episodeRewards.slice(-10).reduce((a, b) => a + b) / 10;
      convergenceData.push(avg);
    }
  }

  const trainingTime = performance.now() - startTime;

  // Final inference
  const inferenceStart = performance.now();
  let finalState = env.reset();
  let inferenceSteps = 0;

  while (inferenceSteps < cells.length) {
    const qValues = qNetwork.forward(finalState.observation);
    const validQValues = finalState.availableActions.map(a => ({ a, q: qValues[a] }));
    const actionIdx = validQValues.reduce((max, curr) =>
      curr.q > max.q ? curr : max
    ).a;

    const gridX = actionIdx % 10;
    const gridY = Math.floor(actionIdx / 10);
    const position = {
      x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
      y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
    };

    const action: RLAction = { type: 'place', position };
    const { state: nextState, done } = env.step(action);

    finalState = nextState;
    inferenceSteps++;

    if (done) break;
  }

  const inferenceTime = performance.now() - inferenceStart;

  // Calculate final metrics
  const finalCells = env.getCells();
  let totalWirelength = 0;
  for (const net of nets) {
    const positions: Point[] = [];
    for (const pinId of net.pins) {
      const cellId = pinId.split('_')[0];
      const cell = finalCells.find(c => c.id === cellId);
      if (cell?.position) {
        const pin = cell.pins.find(p => p.id === pinId);
        if (pin) {
          positions.push({
            x: cell.position.x + pin.position.x,
            y: cell.position.y + pin.position.y,
          });
        }
      }
    }
    if (positions.length >= 2) {
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y));
      totalWirelength += (maxX - minX + maxY - minY) * net.weight;
    }
  }

  let overlapArea = 0;
  for (let i = 0; i < finalCells.length; i++) {
    for (let j = i + 1; j < finalCells.length; j++) {
      const c1 = finalCells[i];
      const c2 = finalCells[j];
      if (c1.position && c2.position) {
        const overlapX = Math.max(
          0,
          Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
            Math.max(c1.position.x, c2.position.x)
        );
        const overlapY = Math.max(
          0,
          Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
            Math.max(c1.position.y, c2.position.y)
        );
        overlapArea += overlapX * overlapY;
      }
    }
  }

  return {
    success: true,
    cells: finalCells,
    totalReward: episodeRewards[episodeRewards.length - 1] || 0,
    episodeRewards,
    wirelength: totalWirelength,
    overlap: overlapArea,
    convergence: convergenceData,
    trainingTime,
    inferenceTime,
    steps: inferenceSteps,
  };
}

/**
 * Q-Learning for Placement
 * Simple tabular Q-learning approach
 */
export function qLearningPlacement(params: RLParams): RLResult {
  const startTime = performance.now();
  const {
    cells,
    nets,
    chipWidth,
    chipHeight,
    episodes = 50,
    learningRate = 0.1,
    discountFactor = 0.9,
    epsilon = 0.2,
  } = params;

  const env = new ChipPlacementEnv(cells, nets, chipWidth, chipHeight);
  const gridSize = 10;

  // Q-table: state -> action -> value
  const qTable = new Map<string, Map<number, number>>();

  const episodeRewards: number[] = [];
  const convergenceData: number[] = [];

  // Training
  for (let episode = 0; episode < episodes; episode++) {
    let state = env.reset();
    let episodeReward = 0;
    let steps = 0;

    while (steps < cells.length) {
      const stateKey = state.observation.join(',');

      if (!qTable.has(stateKey)) {
        qTable.set(stateKey, new Map());
      }

      // Epsilon-greedy
      let actionIdx: number;
      if (Math.random() < epsilon) {
        actionIdx = state.availableActions[
          Math.floor(Math.random() * state.availableActions.length)
        ];
      } else {
        const actionValues = qTable.get(stateKey)!;
        let bestAction = state.availableActions[0];
        let bestValue = actionValues.get(bestAction) || 0;

        for (const a of state.availableActions) {
          const value = actionValues.get(a) || 0;
          if (value > bestValue) {
            bestValue = value;
            bestAction = a;
          }
        }
        actionIdx = bestAction;
      }

      const gridX = actionIdx % gridSize;
      const gridY = Math.floor(actionIdx / gridSize);
      const position = {
        x: (gridX / gridSize) * chipWidth + Math.random() * (chipWidth / gridSize),
        y: (gridY / gridSize) * chipHeight + Math.random() * (chipHeight / gridSize),
      };

      const action: RLAction = { type: 'place', position };
      const { state: nextState, reward, done } = env.step(action);

      episodeReward += reward;

      // Q-learning update
      const currentQ = qTable.get(stateKey)!.get(actionIdx) || 0;
      const nextStateKey = nextState.observation.join(',');

      let maxNextQ = 0;
      if (qTable.has(nextStateKey)) {
        const nextValues = Array.from(qTable.get(nextStateKey)!.values());
        maxNextQ = nextValues.length > 0 ? Math.max(...nextValues) : 0;
      }

      const newQ = currentQ + learningRate * (reward + discountFactor * maxNextQ - currentQ);
      qTable.get(stateKey)!.set(actionIdx, newQ);

      state = nextState;
      steps++;

      if (done) break;
    }

    episodeRewards.push(episodeReward);

    if (episode >= 10) {
      const avg = episodeRewards.slice(-10).reduce((a, b) => a + b) / 10;
      convergenceData.push(avg);
    }
  }

  const trainingTime = performance.now() - startTime;

  // Inference with learned policy
  const inferenceStart = performance.now();
  let finalState = env.reset();
  let inferenceSteps = 0;

  while (inferenceSteps < cells.length) {
    const stateKey = finalState.observation.join(',');
    const actionValues = qTable.get(stateKey);

    let actionIdx: number;
    if (actionValues && actionValues.size > 0) {
      let bestAction = finalState.availableActions[0];
      let bestValue = actionValues.get(bestAction) || 0;

      for (const a of finalState.availableActions) {
        const value = actionValues.get(a) || 0;
        if (value > bestValue) {
          bestValue = value;
          bestAction = a;
        }
      }
      actionIdx = bestAction;
    } else {
      actionIdx = finalState.availableActions[0];
    }

    const gridX = actionIdx % gridSize;
    const gridY = Math.floor(actionIdx / gridSize);
    const position = {
      x: (gridX / gridSize) * chipWidth + Math.random() * (chipWidth / gridSize),
      y: (gridY / gridSize) * chipHeight + Math.random() * (chipHeight / gridSize),
    };

    const action: RLAction = { type: 'place', position };
    const { state: nextState, done } = env.step(action);

    finalState = nextState;
    inferenceSteps++;

    if (done) break;
  }

  const inferenceTime = performance.now() - inferenceStart;
  const finalCells = env.getCells();

  // Calculate metrics (same as DQN)
  let totalWirelength = 0;
  for (const net of nets) {
    const positions: Point[] = [];
    for (const pinId of net.pins) {
      const cellId = pinId.split('_')[0];
      const cell = finalCells.find(c => c.id === cellId);
      if (cell?.position) {
        const pin = cell.pins.find(p => p.id === pinId);
        if (pin) {
          positions.push({
            x: cell.position.x + pin.position.x,
            y: cell.position.y + pin.position.y,
          });
        }
      }
    }
    if (positions.length >= 2) {
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y));
      totalWirelength += (maxX - minX + maxY - minY) * net.weight;
    }
  }

  let overlapArea = 0;
  for (let i = 0; i < finalCells.length; i++) {
    for (let j = i + 1; j < finalCells.length; j++) {
      const c1 = finalCells[i];
      const c2 = finalCells[j];
      if (c1.position && c2.position) {
        const overlapX = Math.max(
          0,
          Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
            Math.max(c1.position.x, c2.position.x)
        );
        const overlapY = Math.max(
          0,
          Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
            Math.max(c1.position.y, c2.position.y)
        );
        overlapArea += overlapX * overlapY;
      }
    }
  }

  return {
    success: true,
    cells: finalCells,
    totalReward: episodeRewards[episodeRewards.length - 1] || 0,
    episodeRewards,
    wirelength: totalWirelength,
    overlap: overlapArea,
    convergence: convergenceData,
    trainingTime,
    inferenceTime,
    steps: inferenceSteps,
  };
}

/**
 * Policy Network for Policy Gradient methods
 */
class PolicyNetwork {
  private weights: number[][][];
  private biases: number[][];
  private learningRate: number;

  constructor(inputSize: number, hiddenSize: number, outputSize: number, lr: number = 0.001) {
    this.learningRate = lr;

    // Xavier initialization
    this.weights = [
      this.randomMatrix(inputSize, hiddenSize),
      this.randomMatrix(hiddenSize, outputSize),
    ];
    this.biases = [
      this.randomArray(hiddenSize),
      this.randomArray(outputSize),
    ];
  }

  private randomMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2.0 / rows);
    return Array(rows).fill(0).map(() =>
      Array(cols).fill(0).map(() => (Math.random() - 0.5) * 2 * scale)
    );
  }

  private randomArray(size: number): number[] {
    return Array(size).fill(0).map(() => (Math.random() - 0.5) * 0.1);
  }

  private relu(x: number): number {
    return Math.max(0, x);
  }

  private softmax(x: number[]): number[] {
    const maxVal = Math.max(...x);
    const exp = x.map(val => Math.exp(val - maxVal));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(val => val / sum);
  }

  forward(input: number[]): { logits: number[]; probs: number[] } {
    // Layer 1: input -> hidden
    const hidden = this.biases[0].slice();
    for (let i = 0; i < hidden.length; i++) {
      for (let j = 0; j < input.length; j++) {
        hidden[i] += input[j] * this.weights[0][j][i];
      }
      hidden[i] = this.relu(hidden[i]);
    }

    // Layer 2: hidden -> output
    const logits = this.biases[1].slice();
    for (let i = 0; i < logits.length; i++) {
      for (let j = 0; j < hidden.length; j++) {
        logits[i] += hidden[j] * this.weights[1][j][i];
      }
    }

    // Get probabilities
    const probs = this.softmax(logits);

    return { logits, probs };
  }

  // REINFORCE algorithm update
  update(states: number[][], actions: number[], rewards: number[], discountFactor: number) {
    // Calculate discounted returns
    const returns: number[] = [];
    let G = 0;
    for (let t = rewards.length - 1; t >= 0; t--) {
      G = rewards[t] + discountFactor * G;
      returns[t] = G;
    }

    // Normalize returns for stability
    const meanReturn = returns.reduce((a, b) => a + b) / returns.length;
    const stdReturn = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length
    );
    const normalizedReturns = returns.map(r => (r - meanReturn) / (stdReturn + 1e-8));

    // Update policy using policy gradient
    for (let t = 0; t < states.length; t++) {
      const { logits, probs } = this.forward(states[t]);
      const actionIdx = actions[t];

      // Gradient of log probability
      const gradLogProb = probs.map((p, i) => i === actionIdx ? 1 - p : -p);

      // Policy gradient: ∇J = ∇log(π(a|s)) * G(t)
      const gradient = gradLogProb.map(g => g * normalizedReturns[t]);

      // Simple gradient ascent on output layer
      for (let i = 0; i < this.weights[1].length; i++) {
        for (let j = 0; j < this.weights[1][i].length; j++) {
          this.weights[1][i][j] += this.learningRate * gradient[j] * 0.01;
        }
      }
    }
  }

  // Update weights directly (for Actor-Critic)
  updateWeights(layer: number, i: number, j: number, delta: number) {
    this.weights[layer][i][j] += delta;
  }

  // Copy weights from another policy
  copyWeightsFrom(source: PolicyNetwork) {
    this.weights = source.getWeights().map(w => w.map(row => [...row]));
    this.biases = source.getBiases().map(b => [...b]);
  }

  // Get weights (for copying)
  getWeights(): number[][][] {
    return this.weights;
  }

  // Get biases (for copying)
  getBiases(): number[][] {
    return this.biases;
  }

  sampleAction(probs: number[], availableActions: number[]): number {
    // Create valid probability distribution
    const validProbs = availableActions.map(a => probs[a]);
    const sumProbs = validProbs.reduce((a, b) => a + b, 0);
    const normalizedProbs = validProbs.map(p => p / sumProbs);

    // Sample from distribution
    const rand = Math.random();
    let cumSum = 0;
    for (let i = 0; i < normalizedProbs.length; i++) {
      cumSum += normalizedProbs[i];
      if (rand < cumSum) {
        return availableActions[i];
      }
    }
    return availableActions[availableActions.length - 1];
  }
}

/**
 * Policy Gradient (REINFORCE) for Placement
 * Uses Monte Carlo policy gradient for chip placement
 */
export function policyGradientPlacement(params: RLParams): RLResult {
  const startTime = performance.now();
  const {
    cells,
    nets,
    chipWidth,
    chipHeight,
    episodes = 100,
    learningRate = 0.001,
    discountFactor = 0.99,
  } = params;

  const env = new ChipPlacementEnv(cells, nets, chipWidth, chipHeight);
  const stateSize = env.getState().observation.length;
  const actionSize = 100;

  const policy = new PolicyNetwork(stateSize, 64, actionSize, learningRate);
  const episodeRewards: number[] = [];
  const convergenceData: number[] = [];

  // Training loop
  for (let episode = 0; episode < episodes; episode++) {
    let state = env.reset();
    let episodeReward = 0;
    let steps = 0;

    // Collect trajectory
    const trajectory: {
      states: number[][];
      actions: number[];
      rewards: number[];
    } = {
      states: [],
      actions: [],
      rewards: [],
    };

    while (steps < cells.length) {
      const { probs } = policy.forward(state.observation);
      const actionIdx = policy.sampleAction(probs, state.availableActions);

      // Convert action to position
      const gridX = actionIdx % 10;
      const gridY = Math.floor(actionIdx / 10);
      const position = {
        x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
        y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
      };

      const action: RLAction = { type: 'place', position };
      const { state: nextState, reward, done } = env.step(action);

      // Store transition
      trajectory.states.push(state.observation);
      trajectory.actions.push(actionIdx);
      trajectory.rewards.push(reward);

      episodeReward += reward;
      state = nextState;
      steps++;

      if (done) break;
    }

    // Update policy using REINFORCE
    policy.update(
      trajectory.states,
      trajectory.actions,
      trajectory.rewards,
      discountFactor
    );

    episodeRewards.push(episodeReward);

    if (episode >= 10) {
      const avg = episodeRewards.slice(-10).reduce((a, b) => a + b) / 10;
      convergenceData.push(avg);
    }
  }

  const trainingTime = performance.now() - startTime;

  // Final inference using learned policy
  const inferenceStart = performance.now();
  let finalState = env.reset();
  let inferenceSteps = 0;

  while (inferenceSteps < cells.length) {
    const { probs } = policy.forward(finalState.observation);

    // Greedy action selection (max probability)
    const validProbs = finalState.availableActions.map((a, i) => ({ a, p: probs[a] }));
    const actionIdx = validProbs.reduce((max, curr) => curr.p > max.p ? curr : max).a;

    const gridX = actionIdx % 10;
    const gridY = Math.floor(actionIdx / 10);
    const position = {
      x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
      y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
    };

    const action: RLAction = { type: 'place', position };
    const { state: nextState, done } = env.step(action);

    finalState = nextState;
    inferenceSteps++;

    if (done) break;
  }

  const inferenceTime = performance.now() - inferenceStart;

  // Calculate final metrics
  const finalCells = env.getCells();
  let totalWirelength = 0;
  for (const net of nets) {
    const positions: Point[] = [];
    for (const pinId of net.pins) {
      const cellId = pinId.split('_')[0];
      const cell = finalCells.find(c => c.id === cellId);
      if (cell?.position) {
        const pin = cell.pins.find(p => p.id === pinId);
        if (pin) {
          positions.push({
            x: cell.position.x + pin.position.x,
            y: cell.position.y + pin.position.y,
          });
        }
      }
    }
    if (positions.length >= 2) {
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y));
      totalWirelength += (maxX - minX + maxY - minY) * net.weight;
    }
  }

  let overlapArea = 0;
  for (let i = 0; i < finalCells.length; i++) {
    for (let j = i + 1; j < finalCells.length; j++) {
      const c1 = finalCells[i];
      const c2 = finalCells[j];
      if (c1.position && c2.position) {
        const overlapX = Math.max(
          0,
          Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
            Math.max(c1.position.x, c2.position.x)
        );
        const overlapY = Math.max(
          0,
          Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
            Math.max(c1.position.y, c2.position.y)
        );
        overlapArea += overlapX * overlapY;
      }
    }
  }

  return {
    success: true,
    cells: finalCells,
    totalReward: episodeRewards[episodeRewards.length - 1] || 0,
    episodeRewards,
    wirelength: totalWirelength,
    overlap: overlapArea,
    convergence: convergenceData,
    trainingTime,
    inferenceTime,
    steps: inferenceSteps,
  };
}

/**
 * Actor-Critic for Routing
 * Combines policy gradient (actor) with value function (critic)
 */
export function actorCriticRouting(params: RLParams): RLResult {
  const startTime = performance.now();
  const {
    cells,
    nets,
    chipWidth,
    chipHeight,
    episodes = 100,
    learningRate = 0.001,
    discountFactor = 0.99,
  } = params;

  const env = new ChipPlacementEnv(cells, nets, chipWidth, chipHeight);
  const stateSize = env.getState().observation.length;
  const actionSize = 100;

  // Actor network (policy)
  const actor = new PolicyNetwork(stateSize, 64, actionSize, learningRate);

  // Critic network (value function)
  const critic = new NeuralNetwork(stateSize, 64, 1, learningRate);

  const episodeRewards: number[] = [];
  const convergenceData: number[] = [];

  // Training loop
  for (let episode = 0; episode < episodes; episode++) {
    let state = env.reset();
    let episodeReward = 0;
    let steps = 0;

    const trajectory: {
      states: number[][];
      actions: number[];
      rewards: number[];
      values: number[];
    } = {
      states: [],
      actions: [],
      rewards: [],
      values: [],
    };

    while (steps < cells.length) {
      // Actor: select action
      const { probs } = actor.forward(state.observation);
      const actionIdx = actor.sampleAction(probs, state.availableActions);

      // Critic: estimate value
      const forwardResult = critic.forward(state.observation);
      const value = forwardResult && forwardResult.length > 0 ? forwardResult[0] : 0;

      const gridX = actionIdx % 10;
      const gridY = Math.floor(actionIdx / 10);
      const position = {
        x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
        y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
      };

      const action: RLAction = { type: 'place', position };
      const { state: nextState, reward, done } = env.step(action);

      trajectory.states.push(state.observation);
      trajectory.actions.push(actionIdx);
      trajectory.rewards.push(reward);
      trajectory.values.push(value);

      episodeReward += reward;
      state = nextState;
      steps++;

      if (done) break;
    }

    // Safety check: skip if no trajectory
    if (trajectory.rewards.length === 0) {
      episodeRewards.push(episodeReward);
      if (episode >= 10) {
        const avg = episodeRewards.slice(-10).reduce((a, b) => a + b) / 10;
        convergenceData.push(avg);
      }
      continue;
    }

    // Calculate advantages using TD error
    const advantages: number[] = [];
    for (let t = 0; t < trajectory.rewards.length; t++) {
      const reward = trajectory.rewards[t];
      const value = trajectory.values[t] || 0;
      const nextValue = t < trajectory.values.length - 1 ? (trajectory.values[t + 1] || 0) : 0;

      // TD error: δ = r + γV(s') - V(s)
      const tdError = reward + discountFactor * nextValue - value;
      advantages.push(tdError);
    }

    // Normalize advantages
    const meanAdv = advantages.length > 0 ? advantages.reduce((a, b) => a + b) / advantages.length : 0;
    const stdAdv = advantages.length > 0 ? Math.sqrt(
      advantages.reduce((sum, a) => sum + Math.pow(a - meanAdv, 2), 0) / advantages.length
    ) : 1;
    const normalizedAdv = advantages.map(a => (a - meanAdv) / (stdAdv + 1e-8));

    // Update actor using advantages
    for (let t = 0; t < trajectory.states.length; t++) {
      const { probs } = actor.forward(trajectory.states[t]);
      const actionIdx = trajectory.actions[t];

      const gradLogProb = probs.map((p, i) => i === actionIdx ? 1 - p : -p);
      const gradient = gradLogProb.map(g => g * normalizedAdv[t]);

      // Update actor weights using the public method
      // Only update the output layer weights that exist
      const hiddenSize = 64;
      for (let i = 0; i < Math.min(hiddenSize, gradient.length); i++) {
        for (let j = 0; j < gradient.length; j++) {
          actor.updateWeights(1, i, j, learningRate * gradient[j] * 0.01);
        }
      }
    }

    // Update critic using TD targets
    for (let t = 0; t < trajectory.states.length; t++) {
      const reward = trajectory.rewards[t];
      const nextValue = t < trajectory.values.length - 1 ? trajectory.values[t + 1] : 0;
      const target = reward + discountFactor * nextValue;

      critic.update(trajectory.states[t], [target], 0);
    }

    episodeRewards.push(episodeReward);

    if (episode >= 10) {
      const avg = episodeRewards.slice(-10).reduce((a, b) => a + b) / 10;
      convergenceData.push(avg);
    }
  }

  const trainingTime = performance.now() - startTime;

  // Final inference
  const inferenceStart = performance.now();
  let finalState = env.reset();
  let inferenceSteps = 0;

  while (inferenceSteps < cells.length) {
    const { probs } = actor.forward(finalState.observation);
    const validProbs = finalState.availableActions.map((a, i) => ({ a, p: probs[a] }));
    const actionIdx = validProbs.reduce((max, curr) => curr.p > max.p ? curr : max).a;

    const gridX = actionIdx % 10;
    const gridY = Math.floor(actionIdx / 10);
    const position = {
      x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
      y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
    };

    const action: RLAction = { type: 'place', position };
    const { state: nextState, done } = env.step(action);

    finalState = nextState;
    inferenceSteps++;

    if (done) break;
  }

  const inferenceTime = performance.now() - inferenceStart;

  // Calculate metrics
  const finalCells = env.getCells();
  let totalWirelength = 0;
  for (const net of nets) {
    const positions: Point[] = [];
    for (const pinId of net.pins) {
      const cellId = pinId.split('_')[0];
      const cell = finalCells.find(c => c.id === cellId);
      if (cell?.position) {
        const pin = cell.pins.find(p => p.id === pinId);
        if (pin) {
          positions.push({
            x: cell.position.x + pin.position.x,
            y: cell.position.y + pin.position.y,
          });
        }
      }
    }
    if (positions.length >= 2) {
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y));
      totalWirelength += (maxX - minX + maxY - minY) * net.weight;
    }
  }

  let overlapArea = 0;
  for (let i = 0; i < finalCells.length; i++) {
    for (let j = i + 1; j < finalCells.length; j++) {
      const c1 = finalCells[i];
      const c2 = finalCells[j];
      if (c1.position && c2.position) {
        const overlapX = Math.max(
          0,
          Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
            Math.max(c1.position.x, c2.position.x)
        );
        const overlapY = Math.max(
          0,
          Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
            Math.max(c1.position.y, c2.position.y)
        );
        overlapArea += overlapX * overlapY;
      }
    }
  }

  return {
    success: true,
    cells: finalCells,
    totalReward: episodeRewards[episodeRewards.length - 1] || 0,
    episodeRewards,
    wirelength: totalWirelength,
    overlap: overlapArea,
    convergence: convergenceData,
    trainingTime,
    inferenceTime,
    steps: inferenceSteps,
  };
}

/**
 * PPO (Proximal Policy Optimization) for Floorplanning
 * Advanced policy gradient with clipped objective
 */
export function ppoFloorplanning(params: RLParams): RLResult {
  const startTime = performance.now();
  const {
    cells,
    nets,
    chipWidth,
    chipHeight,
    episodes = 100,
    learningRate = 0.0003,
    discountFactor = 0.99,
    epsilon = 0.2, // PPO clip parameter
  } = params;

  const env = new ChipPlacementEnv(cells, nets, chipWidth, chipHeight);
  const stateSize = env.getState().observation.length;
  const actionSize = 100;

  const policy = new PolicyNetwork(stateSize, 64, actionSize, learningRate);
  const oldPolicy = new PolicyNetwork(stateSize, 64, actionSize, learningRate);
  const critic = new NeuralNetwork(stateSize, 64, 1, learningRate);

  const episodeRewards: number[] = [];
  const convergenceData: number[] = [];
  const ppoEpochs = 4; // Number of PPO update epochs per episode

  // Training loop
  for (let episode = 0; episode < episodes; episode++) {
    let state = env.reset();
    let episodeReward = 0;
    let steps = 0;

    const trajectory: {
      states: number[][];
      actions: number[];
      rewards: number[];
      oldProbs: number[];
    } = {
      states: [],
      actions: [],
      rewards: [],
      oldProbs: [],
    };

    while (steps < cells.length) {
      const { probs } = policy.forward(state.observation);
      const actionIdx = policy.sampleAction(probs, state.availableActions);
      const actionProb = probs[actionIdx];

      const gridX = actionIdx % 10;
      const gridY = Math.floor(actionIdx / 10);
      const position = {
        x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
        y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
      };

      const action: RLAction = { type: 'place', position };
      const { state: nextState, reward, done } = env.step(action);

      trajectory.states.push(state.observation);
      trajectory.actions.push(actionIdx);
      trajectory.rewards.push(reward);
      trajectory.oldProbs.push(actionProb);

      episodeReward += reward;
      state = nextState;
      steps++;

      if (done) break;
    }

    // Calculate returns and advantages
    const returns: number[] = [];
    let G = 0;
    for (let t = trajectory.rewards.length - 1; t >= 0; t--) {
      G = trajectory.rewards[t] + discountFactor * G;
      returns[t] = G;
    }

    // Safety check: ensure we have states
    if (trajectory.states.length === 0) {
      episodeRewards.push(episodeReward);
      convergenceData.push(episodeReward);
      continue;
    }

    const values = trajectory.states.map(s => {
      const forwardResult = critic.forward(s);
      return forwardResult && forwardResult.length > 0 ? forwardResult[0] : 0;
    });
    const advantages = returns.map((r, i) => r - (values[i] || 0));

    // Normalize advantages
    const meanAdv = advantages.length > 0 ? advantages.reduce((a, b) => a + b) / advantages.length : 0;
    const stdAdv = advantages.length > 0 ? Math.sqrt(
      advantages.reduce((sum, a) => sum + Math.pow(a - meanAdv, 2), 0) / advantages.length
    ) : 1;
    const normalizedAdv = advantages.map(a => (a - meanAdv) / (stdAdv + 1e-8));

    // PPO update for multiple epochs
    for (let ppoEpoch = 0; ppoEpoch < ppoEpochs; ppoEpoch++) {
      for (let t = 0; t < trajectory.states.length; t++) {
        const { probs: newProbs } = policy.forward(trajectory.states[t]);
        const actionIdx = trajectory.actions[t];
        const oldProb = trajectory.oldProbs[t];
        const newProb = newProbs[actionIdx];

        // Importance ratio: π(a|s) / π_old(a|s)
        const ratio = newProb / (oldProb + 1e-8);

        // PPO clipped objective
        const advantage = normalizedAdv[t];
        const unclippedObjective = ratio * advantage;
        const clippedObjective =
          Math.max(1 - epsilon, Math.min(1 + epsilon, ratio)) * advantage;
        const ppoObjective = Math.min(unclippedObjective, clippedObjective);

        // Update policy
        const gradLogProb = newProbs.map((p, i) => i === actionIdx ? 1 - p : -p);
        const gradient = gradLogProb.map(g => g * ppoObjective);

        // Update policy weights using the public method
        // Only update the output layer weights that exist
        const hiddenSize = 64;
        for (let i = 0; i < Math.min(hiddenSize, gradient.length); i++) {
          for (let j = 0; j < gradient.length; j++) {
            policy.updateWeights(1, i, j, learningRate * gradient[j] * 0.01);
          }
        }
      }

      // Update critic
      for (let t = 0; t < trajectory.states.length; t++) {
        critic.update(trajectory.states[t], [returns[t]], 0);
      }
    }

    // Update old policy (copy current policy)
    oldPolicy.copyWeightsFrom(policy);

    episodeRewards.push(episodeReward);

    if (episode >= 10) {
      const avg = episodeRewards.slice(-10).reduce((a, b) => a + b) / 10;
      convergenceData.push(avg);
    }
  }

  const trainingTime = performance.now() - startTime;

  // Final inference
  const inferenceStart = performance.now();
  let finalState = env.reset();
  let inferenceSteps = 0;

  while (inferenceSteps < cells.length) {
    const { probs } = policy.forward(finalState.observation);
    const validProbs = finalState.availableActions.map((a, i) => ({ a, p: probs[a] }));
    const actionIdx = validProbs.reduce((max, curr) => curr.p > max.p ? curr : max).a;

    const gridX = actionIdx % 10;
    const gridY = Math.floor(actionIdx / 10);
    const position = {
      x: (gridX / 10) * chipWidth + Math.random() * (chipWidth / 10),
      y: (gridY / 10) * chipHeight + Math.random() * (chipHeight / 10),
    };

    const action: RLAction = { type: 'place', position };
    const { state: nextState, done } = env.step(action);

    finalState = nextState;
    inferenceSteps++;

    if (done) break;
  }

  const inferenceTime = performance.now() - inferenceStart;

  // Calculate metrics
  const finalCells = env.getCells();
  let totalWirelength = 0;
  for (const net of nets) {
    const positions: Point[] = [];
    for (const pinId of net.pins) {
      const cellId = pinId.split('_')[0];
      const cell = finalCells.find(c => c.id === cellId);
      if (cell?.position) {
        const pin = cell.pins.find(p => p.id === pinId);
        if (pin) {
          positions.push({
            x: cell.position.x + pin.position.x,
            y: cell.position.y + pin.position.y,
          });
        }
      }
    }
    if (positions.length >= 2) {
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y));
      totalWirelength += (maxX - minX + maxY - minY) * net.weight;
    }
  }

  let overlapArea = 0;
  for (let i = 0; i < finalCells.length; i++) {
    for (let j = i + 1; j < finalCells.length; j++) {
      const c1 = finalCells[i];
      const c2 = finalCells[j];
      if (c1.position && c2.position) {
        const overlapX = Math.max(
          0,
          Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
            Math.max(c1.position.x, c2.position.x)
        );
        const overlapY = Math.max(
          0,
          Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
            Math.max(c1.position.y, c2.position.y)
        );
        overlapArea += overlapX * overlapY;
      }
    }
  }

  return {
    success: true,
    cells: finalCells,
    totalReward: episodeRewards[episodeRewards.length - 1] || 0,
    episodeRewards,
    wirelength: totalWirelength,
    overlap: overlapArea,
    convergence: convergenceData,
    trainingTime,
    inferenceTime,
    steps: inferenceSteps,
  };
}

/**
 * Main RL algorithm dispatcher
 */
export function runRL(params: RLParams): RLResult {
  switch (params.algorithm) {
    case RLAlgorithm.DQN_FLOORPLANNING:
      return dqnFloorplanning(params);
    case RLAlgorithm.Q_LEARNING_PLACEMENT:
      return qLearningPlacement(params);
    case RLAlgorithm.POLICY_GRADIENT_PLACEMENT:
      return policyGradientPlacement(params);
    case RLAlgorithm.ACTOR_CRITIC_ROUTING:
      return actorCriticRouting(params);
    case RLAlgorithm.PPO_FLOORPLANNING:
      return ppoFloorplanning(params);
    default:
      throw new Error(`Unknown RL algorithm: ${params.algorithm}`);
  }
}
