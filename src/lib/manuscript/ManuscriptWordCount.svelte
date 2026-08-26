<script lang="ts">
  import {
    formatManuscriptWordCount,
    type ManuscriptWordCountSummary,
  } from "./word-count";

  interface Props {
    summary: ManuscriptWordCountSummary;
    targetWords?: number;
    effectiveIncluded?: boolean;
  }

  let { summary, targetWords, effectiveIncluded = true }: Props = $props();
  const label = $derived(formatManuscriptWordCount(summary, {
    ...(targetWords === undefined ? {} : { targetWords }),
    effectiveIncluded,
  }));
</script>

<p class="word-count">{label}</p>

<style>
  .word-count {
    margin: 0.2rem 0 0;
    color: #a9c59f;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.35;
  }
</style>
