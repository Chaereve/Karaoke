/**
 * Extracts normalized peak amplitudes from an AudioBuffer for accurate waveform visualization.
 */
export function extractWaveformPeaks(
  audioBuffer: AudioBuffer,
  bucketCount = 1200
): number[] {
  const totalSamples = audioBuffer.length;
  if (totalSamples === 0 || bucketCount <= 0) {
    return [];
  }

  const channels = audioBuffer.numberOfChannels;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / bucketCount));
  const peaks: number[] = new Array(bucketCount).fill(0);
  let maxPeak = 0.001;

  for (let i = 0; i < bucketCount; i++) {
    const startSample = i * samplesPerBucket;
    const endSample = Math.min(totalSamples, startSample + samplesPerBucket);
    const step = Math.max(1, Math.floor((endSample - startSample) / 64));

    let bucketMax = 0;
    for (let s = startSample; s < endSample; s += step) {
      for (let c = 0; c < channels; c++) {
        const sample = Math.abs(channelData[c][s]);
        if (sample > bucketMax) {
          bucketMax = sample;
        }
      }
    }

    peaks[i] = bucketMax;
    if (bucketMax > maxPeak) {
      maxPeak = bucketMax;
    }
  }

  // Normalize to range [0.03, 1.0] for clean rendering
  return peaks.map((p) => Math.max(0.03, Math.min(1, p / maxPeak)));
}
