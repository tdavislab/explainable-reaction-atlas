let that = this;

// Load in data file
$("#import").click(function () {
  $("#files").click();
});
d3.select("#files").on("change", () => {
  let files = $("#files")[0].files[0];
  if (!files.name.toLowerCase().endsWith(".js")) {
    showBanner("Please select a .js file", "warning");
    return;
  }
  d3
    .select("#input_file")
    .append("div")
    .style("display", "flex")
    .style("justify-content", "center")
    .style("align-items", "center")
    .style("height", "100%")
    .attr("id", "loading").html(`
          <i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>
          Loading data...
      `);

  let fileReader = new FileReader();
  fileReader.onload = function (fileLoadedEvent) {
    let textFromFileLoaded = fileLoadedEvent.target.result;
    $.ajax({
      type: "POST",
      url: "/data_process",
      data: textFromFileLoaded,
      dataType: "text",
      success: function (response) {
        data = JSON.parse(response);
        d3.selectAll("#loading").remove();
        d3.select("#input_file").style("display", "none");
        d3.select("#map_interface").style("display", "block");
        that.graph = new Faerun(data);
      },
      error: function (error) {
        console.log("error", error);
        alert("Incorrect data format!");
        d3.selectAll("#loading").remove();
      },
    });
    d3.select(".columns-group")
      .style("max-height", "1000px")
      .style("visibility", "visible");
  };
  fileReader.readAsText(files, "UTF-8");
});

// Node summary/comparison
function node_explain(nodes, prompt, model_name, include_labels) {
  let llm_output = d3.select("#llm-output");
  llm_output.html(`
        <div class="col-sm-12" style="text-align:center; padding:20px;">
            <i class="fas fa-spinner fa-spin fa-2x" style="margin-right:8px"></i>
            ${nodes.length == 1 ? "Summarizing Neighborhood": "Comparing Neighborhoods"}...
        </div>`);
  $.ajax({
    type: "POST",
    url: "/explain_neighborhoods",
    data: JSON.stringify({
      vertices: nodes,
      prompt: prompt,
      model: model_name,
      include_labels: include_labels,
    }),
    contentType: "application/json",
    success: function (response) {
      let bullets = response["keywords"].map((k) => `- ${k}`).join("<br>");
      llm_output.html(`
        <div class="col-sm-12 group-title">Neighborhood ${nodes.length == 1 ? "Summary": "Comparison"}</div>
        <div class="col-sm-12" id="llm-output-summary">${response["summary"]}</div>
        <div class="col-sm-12 group-title">Keywords</div>
        <div class="col-sm-12" id="llm-output-keywords">${bullets}</div>
      `);
    },
    error: function (error) {
      llm_output.html("");
      console.log("error", error);
      alert("Neighborhood explanation generation failed! See console");
    },
  });
}

// Path Summary/Comparison
function path_explain(nodes, prompt, model_name, include_labels) {
  let llm_output = d3.select("#llm-output");
  llm_output.html(`
    <div class="col-sm-12" style="text-align:center; padding:20px;">
        <i class="fas fa-spinner fa-spin fa-2x"></i>
        ${nodes.length == 1 ? "Summarizing Path": "Comparing Paths"}...
    </div>`);
  $.ajax({
    type: "POST",
    url: "/explain_paths",
    data: JSON.stringify({
      vertices: nodes,
      prompt: prompt,
      model: model_name,
      include_labels: include_labels,
    }),
    contentType: "application/json",
    success: function (response) {
      let bullets = response["keywords"].map((k) => `- ${k}`).join("<br>");
      llm_output.html(`
        <div class="col-sm-12 group-title">Path ${nodes.length == 1 ? "Summary": "Comparison"}</div>
        <div class="col-sm-12" id="llm-output-summary">${response["summary"]}</div>
        <div class="col-sm-12 group-title">Keywords</div>
        <div class="col-sm-12" id="llm-output-keywords">${bullets}</div>
      `);
    },
    error: function (error) {
      llm_output.html("");
      console.log("error", error);
      alert("Path explanation generation failed! See console");
    },
  });
}

function getHDNeighborhood(item, eps) {
  let infoEl = d3.select("#n-selector-info");
  
  infoEl.html(`<div class="col-sm-12" style="text-align:center; padding:20px;">
            <i class="fas fa-spinner fa-spin fa-2x" style="margin-right:8px"></i>
            Fetching Neighborhood
        </div>`);
  $.ajax({
    type: "POST",
    url: "/hd_neighbors",
    data: JSON.stringify({
      index: item,
      eps: eps,
    }),
    contentType: "application/json",
    success: function (response) {
      let neighbors = response["neighbors"];
      window.graph.hd_selection_handler(item, elements = neighbors);
    },
    error: function (error) {
      infoEl.html("");
      console.log("error", error);
      alert("HD Neighborhood computation failed! See console");
    },
  });
}

function openSearchModal(titleText="Search Reaction SMILES", bodyText="Enter a search term:") {
  return new Promise(resolve => {
    // Backdrop
    const backdrop = d3.select("body")
      .append("div")
      .attr("id", "search-modal-backdrop")
      .style("position", "fixed")
      .style("inset", "0")
      .style("background", "rgba(0,0,0,0.5)")
      .style("z-index", "99999")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center");

    // Prevent page scroll while modal is open
    d3.select("body").style("overflow", "hidden");

    // Modal
    const modal = backdrop.append("div")
      .attr("class", "modal-dialog")
      .style("margin", "0")
      .style("max-width", "500px")
      .style("width", "90%");

    const content = modal.append("div")
      .attr("class", "modal-content shadow");

    const header = content.append("div")
      .attr("class", "modal-header");

    header.append("h5")
      .attr("class", "modal-title")
      .text(titleText);

    header.append("button")
      .attr("type", "button")
      .attr("class", "btn-close")
      .attr("aria-label", "Close")
      .on("click", () => close(null));

    const body = content.append("div")
      .attr("class", "modal-body");

    body.append("label")
      .attr("for", "search-modal-input")
      .attr("class", "form-label")
      .text(bodyText);

    const input = body.append("input")
      .attr("id", "search-modal-input")
      .attr("type", "text")
      .attr("class", "form-control")
      .attr("placeholder", titleText);

    const footer = content.append("div")
      .attr("class", "modal-footer");

    footer.append("button")
      .attr("type", "button")
      .attr("class", "btn btn-secondary")
      .text("Cancel")
      .on("click", () => close(null));

    footer.append("button")
      .attr("type", "button")
      .attr("class", "btn btn-primary")
      .text("Search")
      .on("click", submit);

    function cleanup() {
      d3.select("#search-modal-backdrop").remove();
      d3.select("body").style("overflow", null);
    }

    function close(value) {
      cleanup();
      resolve(value);
    }

    function submit() {
      const value = input.property("value");
      cleanup();
      resolve(value);
    }

    input.on("keydown", (event) => {
      if (event.key === "Enter") submit();
      if (event.key === "Escape") close(null);
    });

    setTimeout(() => input.node().focus(), 0);
  });
}

function openConfirmModal(message) {
  return new Promise(resolve => {
    const backdrop = d3.select("body")
      .append("div")
      .style("position", "fixed")
      .style("inset", "0")
      .style("background", "rgba(0,0,0,0.5)")
      .style("z-index", "99999")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center");

    d3.select("body").style("overflow", "hidden");

    const modal = backdrop.append("div")
      .attr("class", "modal-dialog")
      .style("max-width", "500px")
      .style("width", "90%");

    const content = modal.append("div")
      .attr("class", "modal-content shadow");

    content.append("div")
      .attr("class", "modal-header")
      .append("h5")
      .attr("class", "modal-title")
      .text("Confirm");

    content.append("div")
      .attr("class", "modal-body")
      .append("p")
      .text(message);

    const footer = content.append("div")
      .attr("class", "modal-footer");

    footer.append("button")
      .attr("class", "btn btn-secondary")
      .text("Cancel")
      .on("click", () => close(false));

    footer.append("button")
      .attr("class", "btn btn-primary")
      .text("Confirm")
      .on("click", () => close(true));

    function cleanup() {
      backdrop.remove();
      d3.select("body").style("overflow", null);
      d3.select(window).on("keydown.confirmModal", null); // remove listener
    }

    function close(val) {
      cleanup();
      resolve(val);
    }

    setTimeout(() => {
      d3.select(window).on("keydown.confirmModal", (event) => {
        if (event.key === "Enter") close(true);
        if (event.key === "Escape") close(false);
      });
    }, 0);
  });
}

function showBanner(message, type = "info", persist = 5000) {
  const banner = d3.select("body")
    .append("div")
    .attr("class", `alert alert-${type}`)
    .style("position", "fixed")
    .style("top", "20px")
    .style("left", "50%")
    .style("transform", "translateX(-50%)")
    .style("z-index", "99999")
    .style("min-width", "300px")
    .style("text-align", "center")
    .style("box-shadow", "0 4px 12px rgba(0,0,0,0.2)")
    .text(message);

  let timeout = setTimeout(removeBanner, Math.floor(persist * 0.6));

  function removeBanner(fast = false) {
    banner.interrupt(); // stop any ongoing transition
    banner.transition()
      .duration(fast ? 200 : Math.floor(persist * 0.4))
      .style("opacity", 0)
      .remove();
  }

  banner.on("click", () => {
    clearTimeout(timeout);
    removeBanner(true);
  });
}