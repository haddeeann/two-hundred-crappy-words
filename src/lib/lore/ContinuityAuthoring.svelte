<script lang="ts">
  import { tick } from "svelte";
  import {
    CONTINUITY_PROPERTY_DEFINITIONS,
    type ContinuityPropertyDefinition,
  } from "./continuity-registry";
  import {
    continuityValueDraft,
    planContinuityMutation,
    previewContinuityMutation,
    type ContinuityFactDraft,
    type ContinuityMutationPlan,
    type ContinuityMutationPreview,
    type ContinuityMutationRequest,
  } from "./continuity-mutation";
  import type {
    ContinuityAuthoringContext,
    ContinuityNoteChoice,
  } from "./continuity-authoring";
  import {
    continuityNoteChoicesForProperty,
    continuityRelationshipFacts,
    continuityRelationshipNoteChoices,
    continuityRelationshipPropertyDefinitions,
  } from "./continuity-authoring";
  import type {
    CanonStatus,
    ContinuityCertainty,
    ContinuityValue,
    ParsedContinuityFact,
  } from "./types";

  interface Props {
    context: ContinuityAuthoringContext;
    busy: boolean;
    notice: string;
    undoLabel: string;
    onConfirm: (
      plan: ContinuityMutationPlan,
      request: ContinuityMutationRequest,
    ) => Promise<boolean>;
    onUndo: () => Promise<void>;
    scope?: "all" | "relationships";
    requestedFactId?: string | null;
    requestedSourcePath?: string | null;
    requestRevision?: number;
    idPrefix?: string;
  }

  type EditorMode = "add" | "edit";
  type ValueKind = ContinuityValue["kind"];

  let {
    context,
    busy,
    notice,
    undoLabel,
    onConfirm,
    onUndo,
    scope = "all",
    requestedFactId = null,
    requestedSourcePath = null,
    requestRevision = 0,
    idPrefix = "continuity",
  }: Props = $props();
  let canonChoice = $state("");
  let editorMode = $state<EditorMode | null>(null);
  let editingFactId = $state("");
  let factId = $state("");
  let property = $state("born");
  let valueKind = $state<ValueKind>("time");
  let noteTargetId = $state("");
  let textValue = $state("");
  let amount = $state("");
  let minimum = $state("");
  let maximum = $state("");
  let unitSystem = $state("ucum");
  let unit = $state("");
  let calendar = $state("gregorian");
  let expression = $state("");
  let unknownReason = $state("");
  let factCanon = $state("");
  let certainty = $state("");
  let validFromCalendar = $state("gregorian");
  let validFromExpression = $state("");
  let validToCalendar = $state("gregorian");
  let validToExpression = $state("");
  let factNote = $state("");
  let relationshipPropertyChoice = $state("");
  let formError = $state("");
  let preview = $state<{
    plan: ContinuityMutationPlan;
    request: ContinuityMutationRequest;
    exact: ContinuityMutationPreview;
  } | null>(null);
  let firstField = $state<HTMLInputElement | HTMLSelectElement>();
  let previewHeading = $state<HTMLElement>();
  let authoringHeading = $state<HTMLElement>();
  let handledRequestKey = $state("");

  const ready = $derived(context.kind === "ready" ? context : null);
  const relationshipScope = $derived(scope === "relationships");
  const propertyDefinitions = $derived.by(() =>
    relationshipScope
      ? continuityRelationshipPropertyDefinitions(ready?.noteType ?? null)
      : CONTINUITY_PROPERTY_DEFINITIONS,
  );
  const relationshipPropertyDefinitions = $derived.by(() => {
    if (!relationshipScope) return [];
    const definitions = [...propertyDefinitions];
    const current = (CONTINUITY_PROPERTY_DEFINITIONS as readonly ContinuityPropertyDefinition[]).find(
      ({ key, inverseLabel }) => key === property && Boolean(inverseLabel),
    );
    if (
      editorMode === "edit" &&
      current &&
      !definitions.some(({ key }) => key === current.key)
    ) definitions.unshift(current);
    return definitions;
  });
  const editableFacts = $derived.by(() => {
    if (!ready) return [];
    return relationshipScope
      ? continuityRelationshipFacts(ready.facts, ready.noteChoices)
      : [...ready.facts];
  });
  const compatibleNoteChoices = $derived.by(() =>
    noteChoicesForProperty(
      property,
      editorMode === "edit" ? noteTargetId : "",
    ),
  );

  $effect(() => {
    canonChoice = context.kind === "ready" ? (context.noteCanon ?? "") : "";
  });

  $effect(() => {
    if (
      !relationshipScope ||
      !ready ||
      !requestedFactId ||
      !requestedSourcePath ||
      ready.path !== requestedSourcePath
    ) return;
    const requestKey = `${requestRevision}:${requestedSourcePath}:${requestedFactId}`;
    if (handledRequestKey === requestKey) return;
    const fact = editableFacts.find(({ id }) => id === requestedFactId);
    if (!fact) return;
    handledRequestKey = requestKey;
    void beginEdit(fact);
  });

  async function beginAdd(): Promise<void> {
    if (!ready) return;
    editorMode = "add";
    editingFactId = "";
    factId = crypto.randomUUID();
    property = compatibleProperty() ?? (relationshipScope ? "" : "born");
    relationshipPropertyChoice = property || "__custom";
    const definition = CONTINUITY_PROPERTY_DEFINITIONS.find(({ key }) => key === property);
    valueKind = relationshipScope ? "note" : (definition?.valueKinds[0] ?? "text");
    clearValueFields();
    noteTargetId = noteChoicesForProperty(property)[0]?.id ?? "";
    factCanon = "";
    certainty = "";
    validFromExpression = "";
    validToExpression = "";
    factNote = "";
    formError = "";
    preview = null;
    await focusFirstField();
  }

  async function beginEdit(fact: ParsedContinuityFact): Promise<void> {
    editorMode = "edit";
    editingFactId = fact.id;
    factId = fact.id;
    property = fact.property;
    relationshipPropertyChoice = (CONTINUITY_PROPERTY_DEFINITIONS as readonly ContinuityPropertyDefinition[]).some(
      ({ key, inverseLabel }) => key === fact.property && Boolean(inverseLabel),
    ) ? fact.property : "__custom";
    noteTargetId = ready?.noteChoices[0]?.id ?? "";
    loadValue(continuityValueDraft(fact.value));
    if (relationshipScope && fact.value.kind !== "note") {
      valueKind = "note";
      noteTargetId = noteChoicesForProperty(property)[0]?.id ?? "";
    }
    factCanon = fact.canon ?? "";
    certainty = fact.certainty ?? "";
    validFromCalendar = fact.validFrom?.calendar ?? "gregorian";
    validFromExpression = fact.validFrom?.expression ?? "";
    validToCalendar = fact.validTo?.calendar ?? "gregorian";
    validToExpression = fact.validTo?.expression ?? "";
    factNote = fact.note ?? "";
    formError = "";
    preview = null;
    await focusFirstField();
  }

  function clearEditor(): void {
    editorMode = null;
    editingFactId = "";
    formError = "";
    preview = null;
  }

  function clearValueFields(): void {
    textValue = "";
    amount = "";
    minimum = "";
    maximum = "";
    unitSystem = "ucum";
    unit = "";
    calendar = "gregorian";
    expression = "";
    unknownReason = "";
  }

  function loadValue(value: ReturnType<typeof continuityValueDraft>): void {
    clearValueFields();
    valueKind = value.kind;
    if (value.kind === "note") noteTargetId = value.id;
    else if (value.kind === "text") textValue = value.text;
    else if (value.kind === "quantity") {
      amount = value.amount;
      unitSystem = value.unitSystem;
      unit = value.unit;
    } else if (value.kind === "range") {
      minimum = value.minimum;
      maximum = value.maximum;
      unitSystem = value.unitSystem;
      unit = value.unit;
    } else if (value.kind === "time") {
      calendar = value.calendar;
      expression = value.expression;
    } else unknownReason = value.reason;
  }

  function compatibleProperty(): string | null {
    if (!ready) return null;
    const currentType = propertyDefinitions.find(
      ({ subjectTypes }) =>
        ready.noteType !== null && (subjectTypes as readonly string[]).includes(ready.noteType),
    );
    return currentType?.key ?? null;
  }

  function changeProperty(): void {
    const definition = CONTINUITY_PROPERTY_DEFINITIONS.find(({ key }) => key === property);
    if (relationshipScope) {
      valueKind = "note";
    } else if (definition && !(definition.valueKinds as readonly ValueKind[]).includes(valueKind)) {
      valueKind = definition.valueKinds[0];
    }
    if (valueKind === "note") {
      const retainId = editorMode === "edit" ? noteTargetId : "";
      const choices = noteChoicesForProperty(property, retainId);
      noteTargetId = choices.some(({ id }) => id === noteTargetId)
        ? noteTargetId
        : (choices[0]?.id ?? "");
    }
  }

  function changeRelationshipProperty(): void {
    property = relationshipPropertyChoice === "__custom"
      ? ""
      : relationshipPropertyChoice;
    changeProperty();
  }

  function noteChoicesForProperty(
    propertyKey: string,
    retainId = "",
  ): ContinuityNoteChoice[] {
    if (!ready) return [];
    return relationshipScope
      ? continuityRelationshipNoteChoices(ready.noteChoices, propertyKey, retainId)
      : continuityNoteChoicesForProperty(ready.noteChoices, propertyKey, retainId);
  }

  function draft(): ContinuityFactDraft {
    return {
      id: factId,
      property: property.trim(),
      value: valueDraft(),
      canon: (factCanon || null) as CanonStatus | null,
      certainty: (certainty || null) as ContinuityCertainty | null,
      validFrom: validFromExpression.trim()
        ? { kind: "time", calendar: validFromCalendar.trim(), expression: validFromExpression.trim() }
        : null,
      validTo: validToExpression.trim()
        ? { kind: "time", calendar: validToCalendar.trim(), expression: validToExpression.trim() }
        : null,
      note: factNote.trim() || null,
    };
  }

  function valueDraft(): ContinuityFactDraft["value"] {
    if (valueKind === "note") return { kind: "note", id: noteTargetId };
    if (valueKind === "text") return { kind: "text", text: textValue };
    if (valueKind === "quantity") {
      return { kind: "quantity", amount, unitSystem, unit };
    }
    if (valueKind === "range") {
      return { kind: "range", minimum, maximum, unitSystem, unit };
    }
    if (valueKind === "time") return { kind: "time", calendar, expression };
    return { kind: "unknown", reason: unknownReason };
  }

  function previewCanon(): void {
    if (!ready) return;
    openPreview({
      operation: "set-note-canon",
      noteId: ready.noteId,
      canon: (canonChoice || null) as CanonStatus | null,
    });
  }

  function previewFact(): void {
    if (!ready || !editorMode) return;
    const factDraft = draft();
    openPreview(editorMode === "add"
      ? { operation: "add-fact", noteId: ready.noteId, draft: factDraft }
      : {
          operation: "edit-fact",
          noteId: ready.noteId,
          factId: editingFactId,
          draft: factDraft,
        });
  }

  function previewRemoval(factIdToRemove: string): void {
    if (!ready) return;
    openPreview({
      operation: "remove-fact",
      noteId: ready.noteId,
      factId: factIdToRemove,
    });
  }

  async function openPreview(request: ContinuityMutationRequest): Promise<void> {
    if (!ready) return;
    const plan = planContinuityMutation(ready.sourceText, request);
    if (plan.kind === "unavailable") {
      formError = plan.reason;
      preview = null;
      return;
    }
    formError = "";
    preview = { plan, request, exact: previewContinuityMutation(plan) };
    await tick();
    previewHeading?.focus();
  }

  async function confirmPreview(): Promise<void> {
    if (!preview || busy) return;
    const completed = await onConfirm(preview.plan, preview.request);
    if (completed) {
      clearEditor();
      await tick();
      authoringHeading?.focus();
    }
  }

  async function closePreview(): Promise<void> {
    preview = null;
    await tick();
    if (editorMode) firstField?.focus();
    else authoringHeading?.focus();
  }

  async function handleUndo(): Promise<void> {
    await onUndo();
    await tick();
    authoringHeading?.focus();
  }

  async function focusFirstField(): Promise<void> {
    await tick();
    firstField?.focus();
  }

  function noteChoiceLabel(choice: ContinuityNoteChoice): string {
    return `${choice.title}${choice.noteType ? ` · ${choice.noteType}` : ""} — ${choice.path}`;
  }
</script>

<section class="authoring" aria-labelledby={`${idPrefix}-authoring-heading`}>
  <h3 id={`${idPrefix}-authoring-heading`} tabindex="-1" bind:this={authoringHeading}>{relationshipScope ? "Relationship authoring" : "Authoring"}</h3>
  {#if context.kind === "unavailable"}
    <p class="unavailable">{context.reason}</p>
  {:else}
    {#if !relationshipScope}
      <div class="canon-row">
        <label for={`${idPrefix}-note-canon`}>Note canon</label>
        <select id={`${idPrefix}-note-canon`} bind:value={canonChoice} disabled={busy}>
          <option value="">Unspecified</option>
          <option value="idea">Idea</option>
          <option value="draft">Draft</option>
          <option value="canon">Canon</option>
          <option value="retired">Retired</option>
        </select>
        <button type="button" onclick={previewCanon} disabled={busy}>Preview canon</button>
      </div>
    {/if}

    <div class="fact-actions">
      <button type="button" class="primary" onclick={() => void beginAdd()} disabled={busy}>{relationshipScope ? "Add relationship" : "Add fact"}</button>
      {#if undoLabel}
        <button type="button" onclick={() => void handleUndo()} disabled={busy}>{undoLabel}</button>
      {/if}
    </div>

    {#if editableFacts.length > 0}
      <ul class="editable-facts" aria-label={relationshipScope ? "Editable relationships sourced by this note" : "Editable continuity facts"}>
        {#each editableFacts as fact (fact.id)}
          <li>
            <span><strong>{fact.property}</strong> · {fact.value.kind}</span>
            <span class="row-buttons">
              <button type="button" onclick={() => void beginEdit(fact)} disabled={busy}>{relationshipScope ? "Edit relationship" : "Edit"}</button>
              <button type="button" class="danger" onclick={() => previewRemoval(fact.id)} disabled={busy}>Remove</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if editorMode}
      <form class="fact-form" onsubmit={(event) => { event.preventDefault(); previewFact(); }}>
        <h4>{editorMode === "add" ? "New fact" : "Edit fact"}</h4>
        {#if relationshipScope}
          <label>
            Relationship type
            <select bind:this={firstField} bind:value={relationshipPropertyChoice} onchange={changeRelationshipProperty} disabled={busy}>
              {#each relationshipPropertyDefinitions as definition}
                <option value={definition.key}>{definition.label}</option>
              {/each}
              <option value="__custom">Custom relationship…</option>
            </select>
          </label>
          {#if relationshipPropertyChoice === "__custom"}
            <label>
              Custom property
              <input bind:value={property} oninput={changeProperty} placeholder="for example, rival-of" disabled={busy} />
            </label>
          {/if}
          <p class="scope-help">
            Choose a documented relationship or type a custom property. One
            note-reference fact will remain the sole source; no reciprocal is added.
          </p>
        {:else}
          <label>
            Property
            <input bind:this={firstField} bind:value={property} list={`${idPrefix}-properties`} oninput={changeProperty} disabled={busy} />
          </label>
          <datalist id={`${idPrefix}-properties`}>
            {#each propertyDefinitions as definition}
              <option value={definition.key}>{definition.label}</option>
            {/each}
          </datalist>
          <label>
            Value kind
            <select bind:value={valueKind} disabled={busy}>
              <option value="note">Note reference</option>
              <option value="text">Text</option>
              <option value="quantity">Quantity</option>
              <option value="range">Range</option>
              <option value="time">Time</option>
              <option value="unknown">Intentional unknown</option>
            </select>
          </label>
        {/if}

        {#if valueKind === "note"}
          <label>
            Referenced note
            <select bind:value={noteTargetId} disabled={busy || compatibleNoteChoices.length === 0}>
              {#if compatibleNoteChoices.length === 0}<option value="">No compatible unique note IDs available</option>{/if}
              {#each compatibleNoteChoices as choice}
                <option value={choice.id}>{noteChoiceLabel(choice)}</option>
              {/each}
            </select>
          </label>
        {:else if valueKind === "text"}
          <label>Text <input bind:value={textValue} disabled={busy} /></label>
        {:else if valueKind === "quantity"}
          <label>Amount <input bind:value={amount} inputmode="decimal" disabled={busy} /></label>
          <label>Unit system <input bind:value={unitSystem} disabled={busy} /></label>
          <label>Unit <input bind:value={unit} disabled={busy} /></label>
        {:else if valueKind === "range"}
          <label>Minimum <input bind:value={minimum} inputmode="decimal" disabled={busy} /></label>
          <label>Maximum <input bind:value={maximum} inputmode="decimal" disabled={busy} /></label>
          <label>Unit system <input bind:value={unitSystem} disabled={busy} /></label>
          <label>Unit <input bind:value={unit} disabled={busy} /></label>
        {:else if valueKind === "time"}
          <label>Calendar <input bind:value={calendar} disabled={busy} /></label>
          <label>Expression <input bind:value={expression} disabled={busy} /></label>
        {:else}
          <label>Reason <input bind:value={unknownReason} disabled={busy} /></label>
        {/if}

        <details class="qualifiers">
          <summary>Canon, certainty, validity, and note</summary>
          <label>
            Fact canon
            <select bind:value={factCanon} disabled={busy}>
              <option value="">Inherit or unspecified</option>
              <option value="idea">Idea</option>
              <option value="draft">Draft</option>
              <option value="canon">Canon</option>
              <option value="retired">Retired</option>
            </select>
          </label>
          <label>
            Certainty
            <select bind:value={certainty} disabled={busy}>
              <option value="">Unspecified</option>
              <option value="exact">Exact</option>
              <option value="approximate">Approximate</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </label>
          <fieldset>
            <legend>Valid from (optional)</legend>
            <label>Calendar <input bind:value={validFromCalendar} disabled={busy} /></label>
            <label>Expression <input bind:value={validFromExpression} disabled={busy} /></label>
          </fieldset>
          <fieldset>
            <legend>Valid to (optional)</legend>
            <label>Calendar <input bind:value={validToCalendar} disabled={busy} /></label>
            <label>Expression <input bind:value={validToExpression} disabled={busy} /></label>
          </fieldset>
          <label>Writer note <textarea bind:value={factNote} rows="2" disabled={busy}></textarea></label>
        </details>
        <div class="form-buttons">
          <button type="submit" class="primary" disabled={busy}>Preview exact change</button>
          <button type="button" onclick={clearEditor} disabled={busy}>Cancel</button>
        </div>
      </form>
    {/if}

    {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}

    {#if preview}
      <section class="preview" aria-labelledby={`${idPrefix}-preview-heading`}>
        <h4 id={`${idPrefix}-preview-heading`} tabindex="-1" bind:this={previewHeading}>Review exact Markdown change</h4>
        <p>{preview.plan.summary} Fact identity and all unshown bytes stay unchanged.</p>
        <p class="unchanged">{preview.exact.unchangedBeforeCharacters} characters before and {preview.exact.unchangedAfterCharacters} after this excerpt are unchanged. Excerpt begins at line {preview.exact.firstLine}.</p>
        <div class="source-excerpt"><strong>Before</strong><pre>{preview.exact.before || "(nothing)"}</pre></div>
        <div class="source-excerpt"><strong>After</strong><pre>{preview.exact.after || "(nothing)"}</pre></div>
        <div class="form-buttons">
          <button type="button" class="primary" onclick={() => void confirmPreview()} disabled={busy}>{busy ? "Writing…" : "Confirm exact change"}</button>
          <button type="button" onclick={() => void closePreview()} disabled={busy}>Back</button>
        </div>
      </section>
    {/if}
  {/if}
</section>

<style>
  .authoring {
    margin-top: 0.7rem;
    padding-top: 0.65rem;
    border-top: 1px solid #3c3c3c;
  }
  h3, h4, p { margin: 0; }
  h3 { color: #d4d4d4; font-size: 0.76rem; }
  h4 { color: #e1e1e1; font-size: 0.76rem; }
  .unavailable, .notice, .form-error, .preview p { margin-top: 0.45rem; line-height: 1.4; }
  .scope-help { margin-top: 0.45rem; color: #929292; line-height: 1.4; }
  .unavailable, .unchanged { color: #929292; }
  .notice { color: #a7d7ad; }
  .form-error { color: #f2b8b5; }
  .canon-row, .fact-actions, .form-buttons, .editable-facts li, .row-buttons {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .canon-row { margin-top: 0.5rem; flex-wrap: wrap; }
  .canon-row label { margin: 0; }
  .fact-actions { margin-top: 0.55rem; }
  button, select, input, textarea { font: inherit; }
  button {
    padding: 0.25rem 0.45rem;
    border: 1px solid #555;
    border-radius: 3px;
    background: #333;
    color: #d4d4d4;
    cursor: pointer;
  }
  button.primary { border-color: #49749a; color: #d9ecff; }
  button.danger { color: #f2b8b5; }
  button:disabled { cursor: default; opacity: 0.55; }
  button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible, h4:focus-visible {
    outline: 2px solid #75beff;
    outline-offset: 2px;
  }
  select, input, textarea {
    box-sizing: border-box;
    width: 100%;
    margin-top: 0.2rem;
    padding: 0.3rem 0.4rem;
    border: 1px solid #555;
    border-radius: 3px;
    background: #252526;
    color: #e1e1e1;
  }
  .canon-row select { width: auto; margin: 0; }
  .editable-facts { margin: 0.55rem 0 0; padding: 0; list-style: none; }
  .editable-facts li { justify-content: space-between; padding: 0.35rem 0; border-top: 1px solid #343434; }
  .editable-facts li > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  .row-buttons { flex: 0 0 auto; }
  .fact-form, .preview { margin-top: 0.65rem; padding: 0.6rem; border: 1px solid #4b4b4b; border-radius: 4px; background: #2b2b2b; }
  .fact-form > label, .qualifiers label { display: block; margin-top: 0.5rem; color: #b8b8b8; }
  .qualifiers { margin-top: 0.6rem; }
  .qualifiers > summary { color: #d4d4d4; cursor: pointer; }
  fieldset { margin: 0.55rem 0 0; padding: 0.45rem; border: 1px solid #4b4b4b; }
  legend { color: #b8b8b8; }
  .form-buttons { margin-top: 0.65rem; flex-wrap: wrap; }
  .source-excerpt { margin-top: 0.55rem; color: #b8b8b8; }
  pre { margin: 0.25rem 0 0; padding: 0.45rem; overflow: auto; border: 1px solid #444; background: #1e1e1e; color: #d4d4d4; font: 0.68rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
</style>
