<script lang="ts">
  import type { TravelInspectorPresentation } from "./presentation";

  interface Props {
    presentation: TravelInspectorPresentation;
    onOpenSource: (path: string, range: import("$lib/lore/types").SourceRange | null) => void;
  }

  let { presentation, onOpenSource }: Props = $props();
</script>

<details class="travel-inspector">
  <summary>{presentation.summary}</summary>
  {#if presentation.kind === "no-active-note"}
    <p class="empty">Open a location, route, or journey note to inspect travel evidence.</p>
  {:else if presentation.kind === "updating"}
    <p class="empty" role="status">Waiting for the in-memory index to catch up. No stale source actions are shown.</p>
  {:else}
    <header>
      <div>
        <strong>{presentation.title}</strong>
        <small>{presentation.path} · {presentation.noteType}</small>
      </div>
      <span>Source linked</span>
    </header>
    {#each presentation.sections as section (section.title)}
      <section>
        <h3>{section.title}</h3>
        <ul>
          {#each section.items as item, index (`${item.label}:${index}`)}
            <li class:review={item.tone === "review"} class:contradiction={item.tone === "contradiction"}>
              <div class="item-heading">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
              {#if item.detail}<p>{item.detail}</p>{/if}
              {#if item.reference}
                <button type="button" onclick={() => onOpenSource(item.reference!.path, null)}>Open {item.reference.title}</button>
              {/if}
              {#if item.sources.length > 0}
                <div class="sources">
                  {#each item.sources as source (`${source.path}:${source.range.start}`)}
                    <button type="button" onclick={() => onOpenSource(source.path, source.range)}>{source.label}</button>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    {#if presentation.issues.length > 0}
      <section class="issues">
        <h3>Review</h3>
        <ul>
          {#each presentation.issues as issue}
            <li>{issue}</li>
          {/each}
        </ul>
      </section>
    {/if}
    <p class="privacy">Derived locally. No route, arrival, or containment result is written back.</p>
  {/if}
</details>

<style>
  .travel-inspector {
    margin: 0 0 0.75rem;
    color: #b8b8b8;
    font-size: 0.76rem;
  }

  summary {
    padding: 0.3rem 0;
    color: #d4d4d4;
    font-weight: 600;
    cursor: pointer;
  }

  header,
  .item-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }

  header {
    padding: 0.55rem 0 0.4rem;
    border-top: 1px solid #3c3c3c;
  }

  header strong,
  header small {
    display: block;
    overflow-wrap: anywhere;
  }

  header small,
  .privacy,
  .empty {
    color: #929292;
  }

  header > span {
    flex: 0 0 auto;
    padding: 0.1rem 0.3rem;
    border: 1px solid #4b5e50;
    border-radius: 999px;
    color: #a7d7ad;
    font-size: 0.65rem;
  }

  section {
    padding-top: 0.5rem;
    border-top: 1px solid #3c3c3c;
  }

  h3,
  p {
    margin: 0 0 0.35rem;
  }

  h3 {
    color: #d8d8d8;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  section > ul > li {
    padding: 0.45rem 0;
  }

  section > ul > li + li {
    border-top: 1px solid #333;
  }

  li.review {
    color: #ddc98e;
  }

  li.contradiction {
    color: #f2a6a6;
  }

  .item-heading > span {
    color: #e1e1e1;
    text-align: right;
    overflow-wrap: anywhere;
  }

  button {
    padding: 0;
    border: 0;
    background: none;
    color: #75beff;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .sources {
    display: grid;
    gap: 0.18rem;
    margin-top: 0.3rem;
  }

  .sources button {
    color: #929292;
    font-size: 0.68rem;
  }

  .issues li {
    margin: 0.25rem 0;
    color: #ddc98e;
    line-height: 1.35;
  }

  .privacy,
  .empty {
    margin: 0.4rem 0;
    line-height: 1.4;
  }
</style>
