<script>
  export let heading = "";
  export let cta_label = "";

  function handleClick(e) {
    const wrapper = e.currentTarget.closest("[data-island]");
    if (wrapper) wrapper.dispatchEvent(new CustomEvent("cta_click", { bubbles: true }));
  }
</script>

<div role="region" aria-label={heading}>
  <h2>{heading}</h2>
  <button on:click={handleClick}>{cta_label}</button>
</div>
