<script lang="ts">
  import type {
    ActiveLoreConnections,
    LoreConnectionItem,
  } from "./connections";
  import type { LoreUnlinkedMention } from "./mentions";

  interface Props {
    connections: ActiveLoreConnections;
    onOpen: (item: LoreConnectionItem) => void;
    onOpenMention: (mention: LoreUnlinkedMention) => void;
    onCreateMissing: (item: LoreConnectionItem) => void;
  }

  let { connections, onOpen, onOpenMention, onCreateMissing }: Props = $props();
  const MAX_VISIBLE_CONNECTIONS = 50;
  let dismissedMentionKeys = $state<string[]>([]);
  const outgoing = $derived(connections.outgoing.slice(0, MAX_VISIBLE_CONNECTIONS));
  const backlinks = $derived(connections.backlinks.slice(0, MAX_VISIBLE_CONNECTIONS));
  const mentions = $derived(
    connections.mentions.filter(({ key }) => !dismissedMentionKeys.includes(key)),
  );
  const hiddenCount = $derived(
    Math.max(0, connections.outgoing.length - outgoing.length) +
      Math.max(0, connections.backlinks.length - backlinks.length),
  );

  function dismissMention(key: string): void {
    if (!dismissedMentionKeys.includes(key)) {
      dismissedMentionKeys = [...dismissedMentionKeys, key];
    }
  }
</script>

<details class="connections">
  <summary>
    Connections · {connections.outgoing.length} out · {connections.backlinks.length} back · {mentions.length} unlinked
  </summary>
  <div class="connection-columns">
    <section aria-labelledby="outgoing-heading">
      <h2 id="outgoing-heading">Outgoing links</h2>
      {#if outgoing.length === 0}
        <p class="empty">No wiki links in this note.</p>
      {:else}
        <ul>
          {#each outgoing as item (item.key)}
            <li>
              <div class="connection-title">
                {#if item.targetPath}
                  <button type="button" onclick={() => onOpen(item)}>{item.label}</button>
                {:else}
                  <strong>{item.label}</strong>
                {/if}
                <span class:problem={item.status !== "resolved"}>{item.status}</span>
              </div>
              <small>{item.sourceLocation}</small>
              <p>{item.detail}</p>
              {#if item.context}<blockquote>{item.context}</blockquote>{/if}
              {#if item.canCreateMissing}
                <button class="create-missing" type="button" onclick={() => onCreateMissing(item)}>
                  Create missing note…
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
    <section aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading">Backlinks</h2>
      {#if backlinks.length === 0}
        <p class="empty">No indexed note links here yet.</p>
      {:else}
        <ul>
          {#each backlinks as item (item.key)}
            <li>
              <div class="connection-title">
                <button type="button" onclick={() => onOpen(item)}>{item.label}</button>
                <span>resolved</span>
              </div>
              <small>{item.sourceLocation}</small>
              {#if item.context}<blockquote>{item.context}</blockquote>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
  <section class="mentions" aria-labelledby="mentions-heading">
    <h2 id="mentions-heading">Unlinked mentions</h2>
    {#if mentions.length === 0}
      <p class="empty">No clear unlinked lore mentions in this note.</p>
    {:else}
      <p class="mention-intro">Suggestions only. Your prose is never changed automatically.</p>
      <ul>
        {#each mentions as mention (mention.key)}
          <li>
            <div class="connection-title">
              <button type="button" onclick={() => onOpenMention(mention)}>
                {mention.targetTitle}
              </button>
              <span>unlinked</span>
            </div>
            <small>{mention.sourceLocation} · {mention.matchedBy} “{mention.matchedText}”</small>
            <blockquote>{mention.context}</blockquote>
            <button
              class="dismiss-mention"
              type="button"
              onclick={() => dismissMention(mention.key)}
              aria-label={`Dismiss unlinked mention of ${mention.matchedText}`}
            >Dismiss suggestion</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  {#if hiddenCount > 0}
    <p class="hidden-count">
      {hiddenCount} more {hiddenCount === 1 ? "connection is" : "connections are"} omitted from this bounded view.
    </p>
  {/if}
</details>

<style>
  .connections {
    flex: 0 0 auto;
    max-height: 40%;
    overflow: auto;
    border-top: 1px solid #3c3c3c;
    background: #232323;
    color: #b8b8b8;
    font-size: 0.76rem;
  }

  summary {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.45rem 1.5rem;
    background: #292929;
    color: #d4d4d4;
    font-weight: 600;
    cursor: pointer;
  }

  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }

  .connection-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: #3c3c3c;
  }

  section {
    min-width: 0;
    padding: 0.7rem 1.5rem 0.8rem;
    background: #232323;
  }

  h2 {
    margin: 0 0 0.55rem;
    color: #d4d4d4;
    font-size: 0.8rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    padding: 0.5rem 0;
    border-top: 1px solid #333333;
  }

  li:first-child {
    border-top: 0;
  }

  .connection-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.65rem;
  }

  button {
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: #75beff;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  button.create-missing {
    margin-top: 0.45rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid #515151;
    border-radius: 4px;
    background: #303030;
    color: #d4d4d4;
    font-weight: 500;
  }

  button.dismiss-mention {
    margin-top: 0.4rem;
    color: #b8b8b8;
    font-size: 0.7rem;
    font-weight: 500;
  }

  button.dismiss-mention:hover {
    color: #f0f0f0;
  }

  .mentions {
    border-top: 1px solid #3c3c3c;
  }

  .mention-intro {
    margin: 0 0 0.4rem;
    color: #969696;
  }

  button.create-missing:hover {
    background: #3a3a3a;
  }

  .connection-title span {
    flex: 0 0 auto;
    color: #a7d7ad;
    font-size: 0.68rem;
    text-transform: capitalize;
  }

  .connection-title span.problem {
    color: #f6c177;
  }

  small {
    display: block;
    margin-top: 0.15rem;
    color: #969696;
    overflow-wrap: anywhere;
  }

  p,
  blockquote {
    margin: 0.3rem 0 0;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  blockquote {
    padding-left: 0.55rem;
    border-left: 2px solid #545454;
    color: #c8c8c8;
  }

  .empty,
  .hidden-count {
    margin: 0;
  }

  .hidden-count {
    padding: 0.5rem 1.5rem;
  }

  @media (max-width: 760px) {
    .connection-columns {
      grid-template-columns: 1fr;
    }
  }
</style>
