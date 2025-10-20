/**
 * ML Infrastructure for Advanced RL
 * Includes Experience Replay, Target Networks, Prioritized Sampling
 */

import { RLState, RLAction } from '@/types/algorithms';

/**
 * Experience for Replay Buffer
 */
export interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
  priority?: number;
}

/**
 * Experience Replay Buffer
 * Stores past experiences for off-policy learning
 */
export class ReplayBuffer {
  private buffer: Experience[];
  private capacity: number;
  private position: number;

  constructor(capacity: number = 10000) {
    this.capacity = capacity;
    this.buffer = [];
    this.position = 0;
  }

  /**
   * Get buffer contents (for sampling)
   */
  getBuffer(): Experience[] {
    return this.buffer;
  }

  /**
   * Update priority at specific index
   */
  setPriority(index: number, priority: number): void {
    if (index < this.buffer.length) {
      this.buffer[index].priority = priority;
    }
  }

  /**
   * Add experience to buffer
   */
  add(experience: Experience): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(experience);
    } else {
      this.buffer[this.position] = experience;
    }
    this.position = (this.position + 1) % this.capacity;
  }

  /**
   * Sample random batch from buffer
   */
  sample(batchSize: number): Experience[] {
    const batch: Experience[] = [];
    const indices = new Set<number>();

    while (indices.size < Math.min(batchSize, this.buffer.length)) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        batch.push(this.getBuffer()[idx]);
      }
    }

    return batch;
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
    this.position = 0;
  }
}

/**
 * Prioritized Experience Replay Buffer
 * Samples experiences based on TD error priority
 */
export class PrioritizedReplayBuffer extends ReplayBuffer {
  private alpha: number; // Priority exponent
  private beta: number; // Importance sampling exponent
  private betaIncrement: number;
  private epsilon: number; // Small constant to prevent zero priority

  constructor(capacity: number = 10000, alpha: number = 0.6, beta: number = 0.4) {
    super(capacity);
    this.alpha = alpha;
    this.beta = beta;
    this.betaIncrement = 0.001;
    this.epsilon = 1e-6;
  }

  /**
   * Add experience with priority
   */
  add(experience: Experience): void {
    const maxPriority = this.getMaxPriority();
    experience.priority = maxPriority;
    super.add(experience);
  }

  /**
   * Sample batch with prioritized sampling
   */
  samplePrioritized(batchSize: number): {
    batch: Experience[];
    indices: number[];
    weights: number[];
  } {
    const bufferSize = this.size();
    const batch: Experience[] = [];
    const indices: number[] = [];
    const weights: number[] = [];

    // Calculate sampling probabilities
    const priorities = this.getBuffer().map(exp =>
      Math.pow((exp.priority || this.epsilon) + this.epsilon, this.alpha)
    );
    const totalPriority = priorities.reduce((a, b) => a + b, 0);
    const probabilities = priorities.map(p => p / totalPriority);

    // Sample based on priorities
    for (let i = 0; i < Math.min(batchSize, bufferSize); i++) {
      const rand = Math.random();
      let cumSum = 0;
      let idx = 0;

      for (let j = 0; j < probabilities.length; j++) {
        cumSum += probabilities[j];
        if (rand < cumSum) {
          idx = j;
          break;
        }
      }

      batch.push(this.getBuffer()[idx]);
      indices.push(idx);

      // Calculate importance sampling weight
      const probability = probabilities[idx];
      const weight = Math.pow(bufferSize * probability, -this.beta);
      weights.push(weight);
    }

    // Normalize weights
    const maxWeight = Math.max(...weights);
    const normalizedWeights = weights.map(w => w / maxWeight);

    // Increment beta for importance sampling annealing
    this.beta = Math.min(1.0, this.beta + this.betaIncrement);

    return { batch, indices, weights: normalizedWeights };
  }

  /**
   * Update priorities for sampled experiences
   */
  updatePriorities(indices: number[], priorities: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      this.setPriority(indices[i], priorities[i] + this.epsilon);
    }
  }

  private getMaxPriority(): number {
    const buffer = this.getBuffer();
    if (buffer.length === 0) return 1.0;
    return Math.max(...buffer.map(exp => exp.priority || 1.0));
  }
}

/**
 * Target Network Manager
 * Maintains a stable copy of network for DQN variants
 */
export class TargetNetworkManager<T> {
  private targetNetwork: T | null = null;
  private updateFrequency: number;
  private updateCounter: number = 0;
  private tau: number; // Soft update parameter

  constructor(updateFrequency: number = 1000, tau: number = 0.005) {
    this.updateFrequency = updateFrequency;
    this.tau = tau;
  }

  /**
   * Initialize target network
   */
  initialize(network: T): void {
    this.targetNetwork = this.deepCopy(network);
  }

  /**
   * Get target network
   */
  getTarget(): T | null {
    return this.targetNetwork;
  }

  /**
   * Hard update: copy entire network
   */
  hardUpdate(network: T): void {
    this.targetNetwork = this.deepCopy(network);
    this.updateCounter = 0;
  }

  /**
   * Soft update: θ_target = τ*θ + (1-τ)*θ_target
   */
  softUpdate(network: any): void {
    if (!this.targetNetwork || !network) return;

    const target = this.targetNetwork as any;

    // Update weights
    for (let i = 0; i < network.weights.length; i++) {
      for (let j = 0; j < network.weights[i].length; j++) {
        for (let k = 0; k < network.weights[i][j].length; k++) {
          target.weights[i][j][k] =
            this.tau * network.weights[i][j][k] +
            (1 - this.tau) * target.weights[i][j][k];
        }
      }
    }

    // Update biases
    for (let i = 0; i < network.biases.length; i++) {
      for (let j = 0; j < network.biases[i].length; j++) {
        target.biases[i][j] =
          this.tau * network.biases[i][j] +
          (1 - this.tau) * target.biases[i][j];
      }
    }
  }

  /**
   * Check if update is needed and perform it
   */
  maybeUpdate(network: T, useSoftUpdate: boolean = true): boolean {
    this.updateCounter++;

    if (this.updateCounter >= this.updateFrequency) {
      if (useSoftUpdate) {
        this.softUpdate(network);
      } else {
        this.hardUpdate(network);
      }
      return true;
    }

    return false;
  }

  private deepCopy(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

/**
 * Epsilon Greedy Scheduler
 * Manages exploration-exploitation tradeoff
 */
export class EpsilonScheduler {
  private epsilon: number;
  private epsilonMin: number;
  private epsilonDecay: number;
  private decayType: 'linear' | 'exponential';

  constructor(
    epsilonStart: number = 1.0,
    epsilonMin: number = 0.01,
    epsilonDecay: number = 0.995,
    decayType: 'linear' | 'exponential' = 'exponential'
  ) {
    this.epsilon = epsilonStart;
    this.epsilonMin = epsilonMin;
    this.epsilonDecay = epsilonDecay;
    this.decayType = decayType;
  }

  /**
   * Get current epsilon value
   */
  getEpsilon(): number {
    return this.epsilon;
  }

  /**
   * Decay epsilon
   */
  decay(): void {
    if (this.decayType === 'exponential') {
      this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    } else {
      this.epsilon = Math.max(this.epsilonMin, this.epsilon - this.epsilonDecay);
    }
  }

  /**
   * Reset epsilon to initial value
   */
  reset(epsilonStart: number = 1.0): void {
    this.epsilon = epsilonStart;
  }
}

/**
 * Learning Rate Scheduler
 * Manages learning rate decay
 */
export class LearningRateScheduler {
  private lr: number;
  private lrMin: number;
  private lrDecay: number;
  private scheduleType: 'step' | 'exponential' | 'cosine';
  private step: number = 0;
  private totalSteps: number;

  constructor(
    lrStart: number = 0.001,
    lrMin: number = 0.00001,
    lrDecay: number = 0.99,
    scheduleType: 'step' | 'exponential' | 'cosine' = 'exponential',
    totalSteps: number = 1000
  ) {
    this.lr = lrStart;
    this.lrMin = lrMin;
    this.lrDecay = lrDecay;
    this.scheduleType = scheduleType;
    this.totalSteps = totalSteps;
  }

  /**
   * Get current learning rate
   */
  getLearningRate(): number {
    return this.lr;
  }

  /**
   * Step the scheduler
   */
  stepSchedule(): void {
    this.step++;

    switch (this.scheduleType) {
      case 'exponential':
        this.lr = Math.max(this.lrMin, this.lr * this.lrDecay);
        break;

      case 'step':
        if (this.step % 100 === 0) {
          this.lr = Math.max(this.lrMin, this.lr * this.lrDecay);
        }
        break;

      case 'cosine':
        const progress = this.step / this.totalSteps;
        const cosineDecay = 0.5 * (1 + Math.cos(Math.PI * progress));
        this.lr = this.lrMin + (this.lr - this.lrMin) * cosineDecay;
        break;
    }
  }
}

/**
 * Gradient Clipping Utility
 */
export class GradientClipper {
  private maxNorm: number;

  constructor(maxNorm: number = 1.0) {
    this.maxNorm = maxNorm;
  }

  /**
   * Clip gradients by norm
   */
  clipByNorm(gradients: number[]): number[] {
    const norm = Math.sqrt(gradients.reduce((sum, g) => sum + g * g, 0));

    if (norm > this.maxNorm) {
      return gradients.map(g => (g * this.maxNorm) / norm);
    }

    return gradients;
  }

  /**
   * Clip gradients by value
   */
  clipByValue(gradients: number[], minValue: number = -1.0, maxValue: number = 1.0): number[] {
    return gradients.map(g => Math.max(minValue, Math.min(maxValue, g)));
  }
}

/**
 * Reward Normalizer
 * Normalizes rewards for stable training
 */
export class RewardNormalizer {
  private mean: number = 0;
  private variance: number = 1;
  private count: number = 0;
  private alpha: number; // Moving average coefficient

  constructor(alpha: number = 0.01) {
    this.alpha = alpha;
  }

  /**
   * Update statistics with new reward
   */
  update(reward: number): void {
    this.count++;

    // Update running mean
    const delta = reward - this.mean;
    this.mean += this.alpha * delta;

    // Update running variance
    const delta2 = reward - this.mean;
    this.variance += this.alpha * (delta * delta2 - this.variance);
  }

  /**
   * Normalize reward
   */
  normalize(reward: number): number {
    if (this.count === 0) return reward;

    const std = Math.sqrt(Math.max(this.variance, 1e-8));
    return (reward - this.mean) / std;
  }

  /**
   * Get statistics
   */
  getStats(): { mean: number; variance: number; std: number } {
    return {
      mean: this.mean,
      variance: this.variance,
      std: Math.sqrt(Math.max(this.variance, 1e-8)),
    };
  }
}

/**
 * Multi-step Return Calculator
 * Computes n-step returns for better credit assignment
 */
export class MultiStepReturn {
  private gamma: number;
  private nSteps: number;

  constructor(gamma: number = 0.99, nSteps: number = 3) {
    this.gamma = gamma;
    this.nSteps = nSteps;
  }

  /**
   * Calculate n-step returns
   */
  calculate(rewards: number[], values: number[], dones: boolean[]): number[] {
    const returns: number[] = [];

    for (let t = 0; t < rewards.length; t++) {
      let G = 0;
      let discount = 1;

      for (let k = 0; k < this.nSteps && t + k < rewards.length; k++) {
        G += discount * rewards[t + k];
        discount *= this.gamma;

        if (dones[t + k]) break;
      }

      // Add bootstrap value if not terminal
      const bootstrapIdx = Math.min(t + this.nSteps, values.length - 1);
      if (bootstrapIdx < rewards.length && !dones[bootstrapIdx]) {
        G += discount * values[bootstrapIdx];
      }

      returns.push(G);
    }

    return returns;
  }
}

/**
 * Ornstein-Uhlenbeck Noise
 * For exploration in continuous action spaces
 */
export class OUNoise {
  private mu: number;
  private theta: number;
  private sigma: number;
  private state: number;

  constructor(mu: number = 0, theta: number = 0.15, sigma: number = 0.2) {
    this.mu = mu;
    this.theta = theta;
    this.sigma = sigma;
    this.state = mu;
  }

  /**
   * Sample noise
   */
  sample(): number {
    const dx = this.theta * (this.mu - this.state) +
               this.sigma * (Math.random() * 2 - 1);
    this.state += dx;
    return this.state;
  }

  /**
   * Reset noise
   */
  reset(): void {
    this.state = this.mu;
  }
}

/**
 * GAE (Generalized Advantage Estimation) Calculator
 * Computes advantages with variance reduction
 */
export class GAE {
  private gamma: number;
  private lambda: number;

  constructor(gamma: number = 0.99, lambda: number = 0.95) {
    this.gamma = gamma;
    this.lambda = lambda;
  }

  /**
   * Calculate GAE advantages
   */
  calculate(rewards: number[], values: number[], dones: boolean[]): number[] {
    const advantages: number[] = [];
    let gae = 0;

    for (let t = rewards.length - 1; t >= 0; t--) {
      const delta = rewards[t] +
                   this.gamma * (t < rewards.length - 1 ? values[t + 1] : 0) * (dones[t] ? 0 : 1) -
                   values[t];

      gae = delta + this.gamma * this.lambda * (dones[t] ? 0 : gae);
      advantages[t] = gae;
    }

    return advantages;
  }
}
