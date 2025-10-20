'use client';

import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Power as PowerIcon,
  Router as RouterIcon,
} from '@mui/icons-material';
import ExportButton from './ExportButton';
import { LineChart, Histogram, PieChart } from './charts';
import {
  ClockTreeVisualizer,
  PartitionVisualizer,
  ViolationVisualizer,
  RLDashboard,
  EnhancedChipVisualizer
} from './visualizers';

interface AlgorithmResultsProps {
  result: any;
}

export default function AlgorithmResults({ result }: AlgorithmResultsProps) {
  const { category, algorithm, result: data, metadata } = result;

  const renderMetricCard = (title: string, value: string | number, icon: React.ReactNode, unit?: string) => (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {icon}
          <Typography variant="subtitle2" sx={{ ml: 1 }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="h4">
          {typeof value === 'number' ? value.toFixed(2) : value}
          {unit && <Typography component="span" variant="caption" sx={{ ml: 1 }}>{unit}</Typography>}
        </Typography>
      </CardContent>
    </Card>
  );

  const renderPlacementResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Wirelength', data.totalWirelength, <RouterIcon color="primary" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Overlap', data.overlap, <MemoryIcon color="warning" />, 'px²')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Iterations', data.iterations, <SpeedIcon color="info" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Runtime', data.runtime, <CheckIcon color="success" />, 'ms')}
      </Grid>

      {/* Visual Result: Chip Layout */}
      {data.cells && data.cells.length > 0 && (
        <Grid item xs={12}>
          <EnhancedChipVisualizer
            data={data}
            category="placement"
            enableZoom={true}
            enableLayers={false}
            enableAnimation={false}
          />
        </Grid>
      )}

      {data.convergenceData && data.convergenceData.length > 0 && (
        <Grid item xs={12}>
          <LineChart
            title="Convergence Graph"
            data={{
              labels: data.convergenceData.map((_: any, idx: number) => idx.toString()),
              datasets: [{
                label: 'Cost',
                data: data.convergenceData,
                borderColor: '#3f51b5',
                backgroundColor: '#3f51b540',
                fill: true,
              }]
            }}
            height={300}
            xAxisLabel="Iteration"
            yAxisLabel="Cost"
          />
        </Grid>
      )}
    </Grid>
  );

  const renderRoutingResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Total Wirelength', data.totalWirelength, <RouterIcon color="primary" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Vias', data.viaCount, <MemoryIcon color="warning" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Congestion', data.congestion, <SpeedIcon color="info" />, '%')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Runtime', data.runtime, <CheckIcon color="success" />, 'ms')}
      </Grid>

      {/* Visual Result: Routing Layout */}
      {data.wires && data.wires.length > 0 && (
        <Grid item xs={12}>
          <EnhancedChipVisualizer
            data={data}
            category="routing"
            enableZoom={true}
            enableLayers={true}
            enableAnimation={false}
          />
        </Grid>
      )}

      {data.unroutedNets && data.unroutedNets.length > 0 && (
        <Grid item xs={12}>
          <Alert severity="warning">
            {data.unroutedNets.length} nets could not be routed
          </Alert>
        </Grid>
      )}
    </Grid>
  );

  const renderFloorplanningResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Total Area', data.area, <MemoryIcon color="primary" />, 'px²')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Utilization', (data.utilization * 100).toFixed(1), <SpeedIcon color="info" />, '%')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Aspect Ratio', data.aspectRatio, <CheckIcon color="success" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Dead Space', data.deadSpace, <MemoryIcon color="warning" />, 'px²')}
      </Grid>

      {/* Visual Result: Floorplan Layout */}
      {data.blocks && data.blocks.length > 0 && (
        <Grid item xs={12}>
          <EnhancedChipVisualizer
            data={data}
            category="floorplanning"
            enableZoom={true}
            enableLayers={false}
            enableAnimation={false}
          />
        </Grid>
      )}
    </Grid>
  );

  const renderSynthesisResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Gate Count', data.gateCount, <MemoryIcon color="primary" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Area', data.area, <MemoryIcon color="info" />, 'µm²')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Power', data.power, <PowerIcon color="warning" />, 'mW')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Critical Path', data.criticalPathDelay, <SpeedIcon color="error" />, 'ns')}
      </Grid>

      {data.optimizedNetlist && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Optimized Netlist (Preview)
            </Typography>
            <Box
              component="pre"
              sx={{
                bgcolor: '#f5f5f5',
                p: 2,
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: 200,
                fontSize: '0.875rem',
              }}
            >
              {data.optimizedNetlist.split('\n').slice(0, 10).join('\n')}
              {data.optimizedNetlist.split('\n').length > 10 && '\n...'}
            </Box>
          </Paper>
        </Grid>
      )}
    </Grid>
  );

  const renderTimingResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Slack Time', data.slackTime, data.slackTime >= 0 ? <CheckIcon color="success" /> : <ErrorIcon color="error" />, 'ns')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Max Delay', data.maxDelay, <SpeedIcon color="primary" />, 'ns')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Setup Violations', data.setupViolations, data.setupViolations === 0 ? <CheckIcon color="success" /> : <ErrorIcon color="error" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Clock Skew', data.clockSkew, <SpeedIcon color="warning" />, 'ns')}
      </Grid>

      {data.criticalPath && data.criticalPath.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Critical Path
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {data.criticalPath.map((node: string, idx: number) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip label={node} color="primary" size="small" />
                  {idx < data.criticalPath.length - 1 && <Typography sx={{ mx: 1 }}>→</Typography>}
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      )}

      {data.setupViolations > 0 && (
        <Grid item xs={12}>
          <Alert severity="error">
            Timing violations detected! Slack time is negative.
          </Alert>
        </Grid>
      )}
    </Grid>
  );

  const renderPowerResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Total Power', data.totalPower, <PowerIcon color="primary" />, 'mW')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Dynamic Power', data.dynamicPower, <PowerIcon color="info" />, 'mW')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Static Power', data.staticPower, <PowerIcon color="warning" />, 'mW')}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Reduction', data.reduction, <CheckIcon color="success" />, '%')}
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Power Breakdown
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Component</TableCell>
                  <TableCell align="right">Power (mW)</TableCell>
                  <TableCell align="right">Percentage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Clock Power</TableCell>
                  <TableCell align="right">{data.clockPower.toFixed(2)}</TableCell>
                  <TableCell align="right">{((data.clockPower / data.totalPower) * 100).toFixed(1)}%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Switching Power</TableCell>
                  <TableCell align="right">{data.switchingPower.toFixed(2)}</TableCell>
                  <TableCell align="right">{((data.switchingPower / data.totalPower) * 100).toFixed(1)}%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Leakage Power</TableCell>
                  <TableCell align="right">{data.leakagePower.toFixed(2)}</TableCell>
                  <TableCell align="right">{((data.leakagePower / data.totalPower) * 100).toFixed(1)}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Grid>
    </Grid>
  );

  const renderClockTreeResults = () => (
    <>
      {/* Visual Result: Clock Tree */}
      {data.root && (
        <ClockTreeVisualizer result={data} width={800} height={600} />
      )}

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Wirelength', data.totalWirelength, <RouterIcon color="primary" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Clock Skew', data.skew, <SpeedIcon color="warning" />, 'ns')}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Buffer Count', data.bufferCount, <MemoryIcon color="info" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Power', data.powerConsumption, <PowerIcon color="error" />, 'mW')}
        </Grid>
        <Grid item xs={12} md={4}>
          {renderMetricCard('Max Delay', data.maxDelay, <SpeedIcon color="secondary" />, 'ns')}
        </Grid>
        <Grid item xs={12} md={4}>
          {renderMetricCard('Runtime', data.runtime, <CheckIcon color="success" />, 'ms')}
        </Grid>
      </Grid>
    </>
  );

  const renderPartitioningResults = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Partitions', data.partitions.length, <MemoryIcon color="primary" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Cutsize', data.cutsize, <RouterIcon color="warning" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Balance Ratio', data.balanceRatio, <CheckIcon color="info" />)}
      </Grid>
      <Grid item xs={12} md={3}>
        {renderMetricCard('Iterations', data.iterations, <SpeedIcon color="secondary" />)}
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Partition Sizes
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {data.partitions.map((partition: string[], idx: number) => (
              <Chip
                key={idx}
                label={`Partition ${idx}: ${partition.length} cells`}
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );

  const renderDRCLVSResults = () => (
    <>
      {/* Visual Result: Violations */}
      {data.violations && data.violations.length > 0 && (
        <ViolationVisualizer result={data} />
      )}

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Errors', data.errorCount, data.errorCount === 0 ? <CheckIcon color="success" /> : <ErrorIcon color="error" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Warnings', data.warningCount, data.warningCount === 0 ? <CheckIcon color="success" /> : <ErrorIcon color="warning" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Checked Objects', data.checkedObjects, <MemoryIcon color="info" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Runtime', data.runtime, <CheckIcon color="success" />, 'ms')}
        </Grid>

        {(data.errorCount > 0 || data.warningCount > 0) && (
          <Grid item xs={12}>
            <Alert severity={data.errorCount > 0 ? 'error' : 'warning'}>
              Found {data.errorCount} errors and {data.warningCount} warnings. Review violations for details.
            </Alert>
          </Grid>
        )}
      </Grid>
    </>
  );

  const renderRLResults = () => (
    <>
      {/* Visual Result: RL Dashboard */}
      {data.episodeRewards && data.episodeRewards.length > 0 && (
        <RLDashboard result={data} />
      )}

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Total Reward', data.totalReward, <SpeedIcon color="primary" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Wirelength', data.wirelength, <RouterIcon color="info" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Steps', data.steps, <MemoryIcon color="secondary" />)}
        </Grid>
        <Grid item xs={12} md={3}>
          {renderMetricCard('Training Time', data.trainingTime, <CheckIcon color="success" />, 'ms')}
        </Grid>
      </Grid>
    </>
  );

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5">
            Algorithm Results
          </Typography>
          <ExportButton result={result} variant="contained" size="medium" />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Chip label={category.replace('_', ' ').toUpperCase()} color="primary" />
          <Chip label={algorithm.replace('_', ' ')} variant="outlined" />
          {data.success ? (
            <Chip icon={<CheckIcon />} label="Success" color="success" />
          ) : (
            <Chip icon={<ErrorIcon />} label="Failed" color="error" />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Executed at {new Date(metadata.timestamp).toLocaleString()} • Version {metadata.version}
        </Typography>
      </Box>

      {category === 'placement' && renderPlacementResults()}
      {category === 'routing' && renderRoutingResults()}
      {category === 'floorplanning' && renderFloorplanningResults()}
      {category === 'synthesis' && renderSynthesisResults()}
      {category === 'timing_analysis' && renderTimingResults()}
      {category === 'power_optimization' && renderPowerResults()}
      {category === 'clock_tree' && renderClockTreeResults()}
      {category === 'partitioning' && renderPartitioningResults()}
      {category === 'drc_lvs' && renderDRCLVSResults()}
      {category === 'reinforcement_learning' && renderRLResults()}
    </Box>
  );
}
