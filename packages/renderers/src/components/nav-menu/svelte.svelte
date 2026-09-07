<script>
  // Dispatch logic is inlined (not imported from ../emit-event) because this
  // file is compiled standalone at test-time (packages/renderers/src/test-utils/
  // svelte-compile.ts) into a plain .mjs Node cannot resolve a relative .ts
  // import from.
  export let items = [];

  function handleClick(e, item) {
    const wrapper = e.currentTarget.closest("[data-island]");
    if (wrapper) wrapper.dispatchEvent(new CustomEvent("navigate", { detail: item, bubbles: true }));
  }
</script>

<nav role="navigation" aria-label="Main navigation">
  <ul>
    {#each items as item (item.href)}
      <li>
        <a href={item.href} on:click={(e) => handleClick(e, item)}>{item.label}</a>
      </li>
    {/each}
  </ul>
</nav>
