<script>
  export let data = { rows: [] };
  export let page_size = 10;

  $: rows = (data?.rows ?? []).slice(0, page_size);
  $: columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  function handleSort(e, col) {
    const wrapper = e.currentTarget.closest("[data-island]");
    if (wrapper) wrapper.dispatchEvent(new CustomEvent("sort_change", { detail: { column: col }, bubbles: true }));
  }
</script>

<div role="region" aria-label="Results table">
  <table>
    <thead>
      <tr>
        {#each columns as col}
          <th><button on:click={(e) => handleSort(e, col)}>{col}</button></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i (i)}
        <tr>
          {#each columns as col}
            <td>{row[col]}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
