class Faerun {
  constructor(data) {
    this.body = document.getElementsByTagName("body")[0];
    this.data = data;
    this.selectedItems = [];
    this.selectedIndicators = [];
    this.selectedCurrent = []; //index of to display of the selected items
    this.neighborhoods = [];
    this.neighborhoodChecked = [];
    this.paths = [];
    this.pathsChecked = [];

    this.scatterMeta = getScatterMeta();
    this.treeMeta = [
      {
        color: "#666666",
        fog_intensity: 0.0,
        mapping: { c: "c", from: "from", to: "to", x: "x", y: "y", z: "z" },
        name: "reactiontree",
        point_helper: "ReactionAtlas",
      },
    ];
    this.seriesState = {};
    this.el = {};

    this.currentPoint = null;
    this.hoverTimeout = null;
    this.mouseX = 0;
    this.mouseY = 0;

    this.lore = null;
    this.clearColorHex = "#ffffff";
    this.clearColor = null;
    this.view = "front";
    this.antiAliasing = true;
    this.alphaBlending = false;
    this.thumbnailWidth = 250;

    this.treeHelpers = [];
    this.pointHelpers = [];
    this.octreeHelpers = [];
    this.coordinatesHelper = null;

    this.ohIndexToPhName = [];
    this.ohIndexToPhIndex = [];
    this.phIndexMap = {};
    this.ohIndexMap = {};

    this.min = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
    this.max = [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE];
    this.maxRadius = -Number.MAX_VALUE;

    this.coords = {
      show: false,
      grid: false,
      ticks: true,
      tickCount: 10,
      tickLength: 2.0,
      color: "#888888",
      box: false,
      offset: 5.0,
    };

    this.legend = {
      show: true,
      title: "Legend",
    };

    this.el = Faerun.bindElements();

    this.scatterMeta.forEach((s) => {
      this.seriesState[s.name] = 0;
    });

    this.clearColor = Lore.Core.Color.fromHex(this.clearColorHex);
    this.alphaBlending =
      (this.view === "free" ? false : true) || this.alphaBlending;

    this.initLore();
    this.initTreeHelpers();
    this.initPointHelpers();
    this.initCoords();
    this.initAxes();
    this.initView();
    this.initEvents();
    this.renderLegend();

    this.supervised_explanation = false;

    this.isLassoing = false;
    this.lassoEnabled = false;
    this.lassoPoints = [];
    this.hdEpsVal = 0.5;

    this.subtreeSelectEnabled = false;
    this.hdSelectEnabled = false;
    this.endpointSelectEnabled = false;
    this.selectorRoot = null;

    this.unselectedToggle = false;

    this.initLasso();
    this.initExplainer();
  }

  initLore() {
    this.lore = Lore.init("lore", {
      antialiasing: this.antiAliasing,
      clearColor: this.clearColorHex,
      alphaBlending: this.alphaBlending,
      preserveDrawingBuffer: true,
    });
  }

  initLasso() {
    const self = this;

    this.node_ids = Array.from(
      { length: this.data["ReactionAtlas"]["x"].length },
      (_, i) => i,
    );

    const lassoCanvas = document.getElementById("lasso");
    const lassoCtx = lassoCanvas.getContext("2d");

    function resizeCanvas() {
      lassoCanvas.width = window.innerWidth;
      lassoCanvas.height = window.innerHeight;
    }
    this.disable_lasso();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function drawLasso() {
      // 1. Clear canvas
      lassoCtx.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);

      if (self.lassoPoints.length < 3) return;

      // 2. Draw grey overlay
      lassoCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
      lassoCtx.fillRect(0, 0, lassoCanvas.width, lassoCanvas.height);

      // 3. Cut out lasso region
      lassoCtx.globalCompositeOperation = "destination-out";

      lassoCtx.beginPath();
      lassoCtx.moveTo(self.lassoPoints[0].x, self.lassoPoints[0].y);

      for (let i = 1; i < self.lassoPoints.length; i++) {
        lassoCtx.lineTo(self.lassoPoints[i].x, self.lassoPoints[i].y);
      }

      lassoCtx.closePath();
      lassoCtx.fill();

      // 4. Reset mode
      lassoCtx.globalCompositeOperation = "source-over";
    }

    lassoCanvas.addEventListener("mousedown", (e) => {
      if (!self.lassoEnabled) return;

      self.isLassoing = true;
      self.lassoPoints = [{ x: e.offsetX, y: e.offsetY }];
      drawLasso();
    });

    lassoCanvas.addEventListener("mousemove", (e) => {
      if (!self.isLassoing) return;
      self.lassoPoints.push({ x: e.offsetX, y: e.offsetY });
      drawLasso();
    });
    const coordTree = this.octreeHelpers[0];

    lassoCanvas.addEventListener("mouseup", () => {
      self.isLassoing = false;
      self.lassoEnabled = false;
      d3.select("#lasso-toggle").classed("active", self.lassoEnabled);

      if (self.lassoPoints.length < 3) {
        lassoCtx.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
        return;
      }

      // close polygon
      self.lassoPoints.push(self.lassoPoints[0]);

      const selected = self.node_ids.filter((n) =>
        pointInPolygon(n, self.lassoPoints),
      );
      self.neighborhoods.push(selected);

      // clear the lasso after selection
      lassoCtx.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
      self.lassoPoints = [];
      self.disable_lasso();
      self.renderNeighborhoodList();
    });
    function pointInPolygon(index, polygon) {
      let inside = false;

      let point = coordTree.getScreenPosition(index);

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x,
          yi = polygon[i].y;
        const xj = polygon[j].x,
          yj = polygon[j].y;

        const intersect =
          yi > point[1] !== yj > point[1] &&
          point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 0.0000001) + xi;

        if (intersect) inside = !inside;
      }

      return inside;
    }
  }

  initTreeHelpers() {
    this.treeMeta.forEach((t) => {
      let th = new Lore.Helpers.TreeHelper(this.lore, t.name, "tree");
      th.setXYZHexS(
        this.data[t.name].x,
        this.data[t.name].y,
        this.data[t.name].z,
        t.color,
      );
      th.setFog(
        [
          this.clearColor.components[0],
          this.clearColor.components[1],
          this.clearColor.components[2],
          this.clearColor.components[3],
        ],
        t.fog_intensity,
      );
      this.treeHelpers.push(th);
    });
  }

  initPointHelpers() {
    this.scatterMeta.forEach((s) => {
      let mainMult = 0.6;
      let phOutline = new Lore.Helpers.PointHelper(
        this.lore,
        `${s.name}_outline`,
        s.shader,
        {
          maxPointSize: s.max_point_size / 2,
        },
      );
      let ph = new Lore.Helpers.PointHelper(this.lore, s.name, s.shader, {
        maxPointSize: (s.max_point_size * mainMult) / 2,
      });
      const x = this.data[s.name].x;
      const y = this.data[s.name].y;
      const z = this.data[s.name].z;
      const r = this.data[s.name]["colors"][0].r;
      const g = this.data[s.name]["colors"][0].g;
      const b = this.data[s.name]["colors"][0].b;
      const sizes = this.data[s.name].s;

      phOutline.setXYZRGBS(x, y, z, r, g, b, sizes);
      ph.setXYZRGBS(x, y, z, r, g, b, sizes);

      phOutline.setPointScale(s.point_scale);
      phOutline.setFog(
        [
          this.clearColor.components[0],
          this.clearColor.components[1],
          this.clearColor.components[2],
          this.clearColor.components[3],
        ],
        s.fog_intensity,
      );

      ph.setPointScale(s.point_scale * mainMult);
      ph.setFog(
        [
          this.clearColor.components[0],
          this.clearColor.components[1],
          this.clearColor.components[2],
          this.clearColor.components[3],
        ],
        s.fog_intensity,
      );

      this.phIndexMap[s.name] = this.pointHelpers.length;
      this.pointHelpers.push(ph);
      this.pointHelpers.push(phOutline);

      this.min[0] = Faerun.getMin(this.data[s.name].x, this.min[0]);
      this.min[1] = Faerun.getMin(this.data[s.name].y, this.min[1]);
      this.min[2] = Faerun.getMin(this.data[s.name].z, this.min[2]);
      this.max[0] = Faerun.getMax(this.data[s.name].x, this.max[0]);
      this.max[1] = Faerun.getMax(this.data[s.name].y, this.max[1]);
      this.max[2] = Faerun.getMax(this.data[s.name].z, this.max[2]);
      this.maxRadius = ph.getMaxRadius();

      if (s.interactive && this.data[s.name].labels) {
        this.octreeHelpers.push(
          new Lore.Helpers.OctreeHelper(
            this.lore,
            "Octree_" + s.name,
            "tree",
            ph,
          ),
        );

        this.ohIndexMap[s.name] = this.octreeHelpers.length - 1;
        this.ohIndexToPhName.push(s.name);
        this.ohIndexToPhIndex.push(this.phIndexMap[s.name]);
      }
    });
  }

  initCoords() {
    if (!this.coords.show) return;

    let min = [0, 0, 0];
    let max = [0, 0, 0];

    for (var i = 0; i < 3; i++) {
      min[i] = this.min[i] - this.coords.offset;
      max[i] = this.max[i] + this.coords.offset;
    }

    this.coordinatesHelper = new Lore.Helpers.CoordinatesHelper(
      this.lore,
      "Coordinates",
      "coordinates",
      {
        position: new Lore.Math.Vector3f(min[0], min[1], min[2]),
        axis: {
          x: {
            length: max[0] - min[0],
            color: Lore.Core.Color.fromHex(this.coords.color),
          },
          y: {
            length: max[1] - min[1],
            color: Lore.Core.Color.fromHex(this.coords.color),
          },
          z: {
            length: max[2] - min[2],
            color: Lore.Core.Color.fromHex(this.coords.color),
          },
        },
        ticks: {
          enabled: this.coords.ticks,
          x: {
            length: this.coords.tickLength,
            color: Lore.Core.Color.fromHex(this.coords.color),
            count: this.coords.tickCount,
          },
          y: {
            length: this.coords.tickLength,
            color: Lore.Core.Color.fromHex(this.coords.color),
            count: this.coords.tickCount,
          },
          z: {
            length: this.coords.tickLength,
            color: Lore.Core.Color.fromHex(this.coords.color),
            count: this.coords.tickCount,
          },
        },
        box: {
          enabled: this.coords.box,
          x: {
            color: Lore.Core.Color.fromHex(this.coords.color),
          },
          y: {
            color: Lore.Core.Color.fromHex(this.coords.color),
          },
          z: {
            color: Lore.Core.Color.fromHex(this.coords.color),
          },
        },
      },
    );
  }

  initAxes() {
    // Wait for DOM to get ready
    setTimeout(() => {
      this.updateTitle(true);
      this.updateXAxis(true);
      this.updateYAxis(true);
    }, 500);
  }

  initView() {
    let center = new Lore.Math.Vector3f(
      (this.max[0] + this.min[0]) / 2.0,
      (this.max[1] + this.min[1]) / 2.0,
      (this.max[2] + this.min[2]) / 2.0,
    );
    this.lore.controls.setLookAt(center);
    this.lore.controls.setRadius(this.maxRadius + 100);
    this.lore.controls.setView(0.9, -0.5);
    this.lore.controls.setViewByName(this.view);
  }

  initEvents() {
    this.lore.controls.addEventListener("updated", () => {
      // Update the position / content of the annotations every time
      // the view changes
      this.updateTitle();
      this.updateYAxis();
      this.updateXAxis();
      this.updateSelectedIndicators();
    });

    document.addEventListener("pointermove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    Lore.Helpers.OctreeHelper.joinHoveredChanged(this.octreeHelpers, (e) => {
      let phName = this.ohIndexToPhName[e.source];
      if (e.e && this.data[phName].labels) {
        let fullLabel = this.data[phName].labels[e.e.index];
        let labelIndex =
          this.scatterMeta[this.ohIndexToPhIndex[e.source]].label_index[
            this.seriesState[phName]
          ];
        let titleIndex =
          this.scatterMeta[this.ohIndexToPhIndex[e.source]].title_index[
            this.seriesState[phName]
          ];

        let rgbColor = this.pointHelpers[e.source].getColor(e.e.index);
        let hexColor = Lore.Core.Color.rgbToHex(
          rgbColor[0],
          rgbColor[1],
          rgbColor[2],
        );

        this.currentPoint = {
          index: e.e.index,
          fullLabel: fullLabel.split("__"),
          source: phName,
          label: fullLabel.split("__")[labelIndex],
          color: hexColor,
          labelIndex: labelIndex,
          titleIndex: titleIndex,
        };

        this.setTipContent();
        this.el.tip.classList.add("show");

        let pointSize =
          this.pointHelpers[e.source].getPointSize() / window.devicePixelRatio;
        let x = e.e.screenPosition[0];
        let y = e.e.screenPosition[1];

        this.el.hoverIndicator.style.width = pointSize + "px";
        this.el.hoverIndicator.style.height = pointSize + "px";
        this.el.hoverIndicator.style.left = x - pointSize / 2.0 + "px";
        this.el.hoverIndicator.style.top = y - pointSize / 2.0 + "px";

        this.el.hoverIndicator.classList.add("show");
        x = this.mouseX;
        y = this.mouseY;

        if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
        const checkHover = () => {
          if (Math.abs(x - this.mouseX) > 10 || Math.abs(y - this.mouseY) > 10) {
            this.el.tip.classList.remove("show");
            this.el.hoverIndicator.classList.remove("show");
            this.currentPoint = null;
          } else {
            this.hoverTimeout = setTimeout(checkHover, 100);
          }
        };
        this.hoverTimeout = setTimeout(checkHover, 100);
      } else {
        this.currentPoint = null;
        this.el.tip.classList.remove("show");
        this.el.hoverIndicator.classList.remove("show");
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
          this.hoverTimeout = null;
        }
      }
    });

    Lore.Helpers.OctreeHelper.joinSelectedChanged(
      this.octreeHelpers,
      (items) => {
        const prevLength = this.selectedItems?.length || 0;
        const newLength = items?.length || 0;

        if (newLength > prevLength) {
          // added an item
          if (this.subtreeSelectEnabled) {
            const newItem = items.find(
              (item) =>
                !this.selectedItems.some(
                  (cur) => cur.item.index === item.item.index,
                ),
            );
            this.subtree_selection_handler(newItem.item.index);
          } else if (this.endpointSelectEnabled) {
            const newItem = items.find(
              (item) =>
                !this.selectedItems.some(
                  (cur) => cur.item.index === item.item.index,
                ),
            );
            this.endpoint_selection_handler(newItem.item.index);
          } else if (this.hdSelectEnabled) {
            const newItem = items.find(
              (item) =>
                !this.selectedItems.some(
                  (cur) => cur.item.index === item.item.index,
                ),
            );
            this.hd_selection_handler(newItem.item.index);
          }
        }
        this.selectedItems = items;
        this.updateSelected();
      },
    );

    Lore.Helpers.OctreeHelper.joinReselected(this.octreeHelpers, (item) => {
      if (this.subtreeSelectEnabled) {
        this.subtree_selection_handler(item[0].item.e.index);
      } else if (this.endpointSelectEnabled) {
        this.endpoint_selection_handler(item[0].item.e.index);
      } else if (this.hdSelectEnabled) {
        this.hd_selection_handler(item[0].item.e.index);
      }

      this.updateSelected(
        this.getSelectedIndex(item[0].source, item[0].item.e.index),
      );
    });

    // Event listeners
    this.el.search.addEventListener("click", async e => {
      e.preventDefault();
      let searchTerm = await openSearchModal(); // prompt('Search Reaction SMILES:', '');
      if (searchTerm === null) {
        return false;
      }
      const results = this.searchTerm(searchTerm);
      if (results.length > 20) {
        const proceed = await openConfirmModal(`Found ${results.length}. Too many to view individually, view as a neighborhood? (Will remove existing neighborhoods)`);

        if (!proceed) return;
        
        this.neighborhoods = [results]
        this.neighborhoodChecked = [];
        this.activateNeighborhoodExplainer();
      } else {
        if (results.length === 0) {
          showBanner(`No results found for ${searchTerm}`, "info");
        } else {
          showBanner(`Found ${results.length}`);
        }
        results.forEach(index => {
          this.octreeHelpers[0].addSelected(index);
        });
      }
      return false;
    });

    this.el.selectedPrev.addEventListener("click", (e) => {
      e.preventDefault();
      this.updateSelected(this.selectedCurrent - 1);
      return false;
    });

    this.el.selectedNext.addEventListener("click", (e) => {
      e.preventDefault();
      this.updateSelected(this.selectedCurrent + 1);
      return false;
    });

    this.el.selectedRemove.addEventListener("click", (e) => {
      e.preventDefault();
      let item = this.selectedItems[this.selectedCurrent];
      this.octreeHelpers[item.source].removeSelected(item.index);
      return false;
    });

    document.addEventListener("dblclick", (e) => {
      if (this.currentPoint) {
        var index = this.currentPoint.index;
        var labels = this.currentPoint.label.split("__");
        var source = this.currentPoint.source;
        eval(
          this.scatterMeta[this.phIndexMap[source]].ondblclick[
            this.seriesState[source]
          ],
        );
      }
    });
    d3.select(".Reaction_Picture")
      .on("click", () => {
        clearReactionPicture();
      });
    d3.select(window).on("keydown.reactionPicture", (event) => {
      if (event.key === "Escape") {
        clearReactionPicture();
      }
    });

    document.addEventListener("mousemove", (e) => {
      let x = e.clientX;
      let y = e.clientY;

      if (x > window.innerWidth - this.el.tip.offsetWidth - 20) {
        x -= this.el.tip.offsetWidth;
      } else {
        x += 10;
      }

      if (y > window.innerHeight - this.el.tip.offsetHeight - 20) {
        y -= this.el.tip.offsetHeight;
      } else {
        y += 10;
      }

      if (this.el.tip) {
        this.el.tip.style.top = y + "px";
        this.el.tip.style.left = x + "px";
      }
    });

    this.el.selectedToggle.addEventListener("click", (e) => {
      this.el.selectedContainer.classList.toggle("hide");
      if (this.el.selectedContainer.classList.contains("hide"))
        this.el.selectedToggle.innerHTML = '<i class="fas fa-toggle-off"></i>';
      else
        this.el.selectedToggle.innerHTML = '<i class="fas fa-toggle-on"></i>';

      e.preventDefault();
      return false;
    });

    this.el.showControls.addEventListener("click", (e) => {
      this.el.moreControls.classList.toggle("hide");
      e.preventDefault();
      return false;
    });
    //Floating window settings
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const expWin = this.el.explainerWindow;
    this.el.explainerWindowHeader.addEventListener("mousedown", (e) => {
      isDragging = true;

      const rect = expWin.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      expWin.style.left = rect.left + "px";
      expWin.style.top = rect.top + "px";
      expWin.style.right = "auto";
      expWin.style.bottom = "auto";

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    function onMouseMove(e) {
      if (!isDragging) return;

      expWin.style.left = Math.max(0, e.clientX - offsetX) + "px";
      expWin.style.top = Math.max(0, e.clientY - offsetY) + "px";
    }

    function onMouseUp() {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }

  initExplainer() {
    // Explainer Window
    const self = this;

    d3.select("#close-floating-window").on("click", function (event) {
      event.preventDefault();
      d3.select("#explainer-window").style("display", "none");
      self.disable_all_selectors();
      // deactivate both
      d3.select("#neighborhood-explainer").classed("active", false);
      d3.select("#path-explainer").classed("active", false);
    });

    let generate_button = document.getElementById("generate-summary-button");
    let model_select = document.getElementById("llm-model-select");
    let default_prompt_btn = document.getElementById("get-prompt-button");
    let prompt_textbox = document.getElementById("prompt-textbox");
    let prompt_gen = document.getElementById("custom-prompt-checkbox");

    let that = this;
    generate_button.onclick = function () {
      let prompt_val = prompt_gen.checked
        ? prompt_textbox.value.trim()
        : that.get_default_prompt();
      let neighborhoodCount = that.count_selected_neighborhoods();
      if (prompt_val.length == 0) {
        showBanner("Prompt cannot be empty", "danger");
        return;
      }
      let xType = that.get_explainer_type();
      if (xType === "n" && neighborhoodCount > 0) {
        node_explain(
          that.get_selected_neighborhoods(),
          prompt_val,
          model_select.value,
          that.supervised_explanation,
        );
      } else if (xType === "p" && that.count_selected_paths() > 0) {
        path_explain(
          that.get_selected_paths(),
          prompt_val,
          model_select.value,
          that.supervised_explanation,
        );
      } else {
        // showBanner("Must have selected Neighborhood or Path", "danger");
      }
    };

    default_prompt_btn.onclick = function () {
      prompt_textbox.value = that.get_default_prompt();
    };

    prompt_gen.onchange = function () {
      if (prompt_gen.checked) {
        $("#prompt-display-container").show();
      } else {
        $("#prompt-display-container").hide();
      }
    };
    // neighborhood explainer
    this.el.nExplainer.addEventListener("click", (e) => {
      self.activateNeighborhoodExplainer();
      });

    this.el.pExplainer.addEventListener("click", (e) => {
      d3.select("#path-explainer").classed("active", true);
      d3.select("#neighborhood-explainer").classed("active", false);

      d3.select("#explainer-window-name").text("Path Explainer");

      d3.select("#explainer-window-body").html(`
            <div class="group-title">Selection Methods</div>
            <div class="button-row">
              <button id="endpoint-toggle" class="btn btn-outline-dark">
                Endpoints
              </button>
            </div>
            <div id="p-selector-info" class="tool-info" style="margin-left: 10px; margin-top: 4px"></div>
            <div id="paths-list"></div>
            `);

      d3.select("#explainer-window").style("display", null);
      d3.select("#endpoint-toggle").on("click", function () {
        if (self.endpointSelectEnabled) {
          self.disable_endpoint_select();
        } else {
          if (self.paths.length == 2) {
            showBanner(
              "Can only have at most 2 paths selected. Please remove one to select another",
              "danger"
            );
            return;
          }
          self.enable_endpoint_select();
        }
      });
      self.disable_all_selectors();
      self.renderPathsList();
    });

    const supervised = document.getElementById("supervised-toggle");

    supervised.addEventListener("change", function () {
      self.supervised_explanation = this.checked;
    });

    const unselectedToggle = document.getElementById("hide-unselected-toggle");

    unselectedToggle.addEventListener("change", function () {
      self.unselectedToggle = this.checked;
      self.highlightSelectedGroups();
    });
  }

  activateNeighborhoodExplainer() {
    let self = this;
    d3.select("#neighborhood-explainer").classed("active", true);
    d3.select("#path-explainer").classed("active", false);

    d3.select("#explainer-window-name").text("Neighborhood Explainer");

    d3.select("#explainer-window-body").html(`
          <div class="group-title">Selection Methods</div>
          <div class="button-row">
            <button id="lasso-toggle" class="btn btn-outline-dark">
              Lasso
            </button>
            <button id="subtree-toggle" class="btn btn-outline-dark">
              Subtree
            </button>
            <button id="hd-toggle" class="btn btn-outline-dark">
              \u03B5-radius (HD)
            </button>
          </div>
          <div id="n-selector-info" class="tool-info" style="margin-left: 10px; margin-top: 4px"></div>
          <div id="neighborhood-list"></div>
          `);

    d3.select("#explainer-window").style("display", null);

    d3.select("#lasso-toggle").on("click", function () {
      if (self.lassoEnabled) {
        self.disable_lasso();
      } else {
        if (self.neighborhoods.length == 2) {
          showBanner(
            "Can only have at most 2 neighborhoods selected. Please remove one to select another",
            "danger"
          );
          return;
        }
        self.enable_lasso();
      }
    });
    d3.select("#subtree-toggle").on("click", function () {
      if (self.subtreeSelectEnabled) {
        self.disable_subtree_select();
      } else {
        if (self.neighborhoods.length == 2) {
          showBanner(
            "Can only have at most 2 neighborhoods selected. Please remove one to select another",
            "danger"
          );
          return;
        }
        self.enable_subtree_select();
      }
    });
    d3.select("#hd-toggle").on("click", function () {
      if (self.hdSelectEnabled) {
        self.disable_hd_select();
      } else {
        if (self.neighborhoods.length == 2) {
          showBanner(
            "Can only have at most 2 neighborhoods selected. Please remove one to select another",
            "danger"
          );
          return;
        }
        self.enable_hd_select();
      }
    });

    self.renderNeighborhoodList();
    self.disable_all_selectors();
  }

  renderNeighborhoodList() {
    const root = d3.select("#neighborhood-list");
    root.selectAll("*").remove(); // remove all children
    // add any extra
    while (this.neighborhoodChecked.length < this.neighborhoods.length) {
      this.neighborhoodChecked.push(true);
    }

    const rows = root.selectAll(".neighborhood-row").data(
      this.neighborhoods.map((data, i) => ({ data, i })),
      (d) => `${d.i}`,
    );

    rows.exit().remove();

    const rowsEnter = rows
      .enter()
      .append("div")
      .attr("class", "neighborhood-row");

    const rowsMerge = rowsEnter.merge(rows);

    rowsMerge.each((d, idx, nodes) => {
      const row = d3.select(nodes[idx]);
      const inputId = `neighborhood-${d.i + 1}`;

      row.html("");

      const label = row
        .append("label")
        .attr("class", "neighborhood-item")
        .attr("for", inputId);

      label
        .append("input")
        .attr("type", "checkbox")
        .attr("id", inputId)
        .property("checked", this.neighborhoodChecked[d.i])
        .on("change", (event) => {
          this.neighborhoodChecked[d.i] = event.target.checked;
          this.highlightSelectedGroups();
        });

      label
        .append("span")
        .text(`Neighborhood ${d.i + 1} (size: ${d.data.length})`);

      row
        .append("button")
        .attr("type", "button")
        .attr("class", "btn btn-danger neighborhood-remove")
        .text("x")
        .on("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          this.neighborhoods = this.neighborhoods.filter(
            (n, j) => !(j === d.i),
          );
          this.neighborhoodChecked = this.neighborhoodChecked.filter(
            (n, j) => !(j === d.i),
          );

          this.renderNeighborhoodList();
        });
    });

    this.highlightSelectedGroups();
  }

  renderPathsList() {
    const root = d3.select("#paths-list");
    root.selectAll("*").remove(); // remove all children
    // add any extra
    while (this.pathsChecked.length < this.paths.length) {
      this.pathsChecked.push(true);
    }

    const rows = root.selectAll(".path-row").data(
      this.paths.map((data, i) => ({ data, i })),
      (d) => `${d.i}`,
    );

    rows.exit().remove();

    const rowsEnter = rows.enter().append("div").attr("class", "path-row");

    const rowsMerge = rowsEnter.merge(rows);

    rowsMerge.each((d, idx, nodes) => {
      const row = d3.select(nodes[idx]);
      const inputId = `path-${d.i + 1}`;

      row.html("");

      const label = row
        .append("label")
        .attr("class", "path-item")
        .attr("for", inputId);

      label
        .append("input")
        .attr("type", "checkbox")
        .attr("id", inputId)
        .property("checked", this.pathsChecked[d.i])
        .on("change", (event) => {
          this.pathsChecked[d.i] = event.target.checked;
          this.highlightSelectedGroups();
        });

      label.append("span").text(`Path ${d.i + 1} (size: ${d.data.length})`);

      row
        .append("button")
        .attr("type", "button")
        .attr("class", "btn btn-danger path-remove")
        .text("x")
        .on("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          this.paths = this.paths.filter((n, j) => !(j === d.i));
          this.pathsChecked = this.pathsChecked.filter((n, j) => !(j === d.i));

          this.renderPathsList();
        });
    });
    this.highlightSelectedGroups();
  }

  setTipContent() {
    draw_reaction_SMILES(this.currentPoint.label, "mouse movement");

    this.el.tipText.innerHTML = `${this.currentPoint.fullLabel[3]}<br />L2norm: ${this.currentPoint.fullLabel[2].slice(0, 7)}<br />`;
    this.el.tip.style.borderColor = this.currentPoint.color;
  }

  setSelectedContent(fullLabel, labelIndex, selectedLabels, img) {
    this.el.selectedContainer.innerHTML = "";
    if (img) this.el.selectedContainer.appendChild(img);

    fullLabel.forEach((l, i) => {
      if (i === labelIndex) return;
      if (selectedLabels && selectedLabels[i]) {
        this.el.selectedContainer.appendChild(
          Faerun.createElement("div", {
            classes: "label",
            content: selectedLabels[i],
          }),
        );
      }
      this.el.selectedContainer.appendChild(
        Faerun.createElement("div", { classes: "content", content: l }),
      );
    });

    // Update the indicator
    this.updateSelectedIndicators();
  }

  renderLegend() {
    if (!this.legend.show) return;

    let legend = document.getElementById("legend");

    if (legend) this.body.removeChild(legend);

    legend = Faerun.createElement("div", { id: "legend" });
    this.body.appendChild(legend);

    if (this.legend.title && this.legend.title !== "")
      legend.appendChild(Faerun.createElement("h2", { content: "Legend" }));

    let container = Faerun.createElement("div", { classes: "container" });
    legend.appendChild(container);

    this.scatterMeta.forEach((s) => {
      let index = this.seriesState[s.name];
      if (s.has_legend) {
        let legendSection = [];
        if (!s.is_range[index]) {
          s.legend[index].forEach((v) => {
            legendSection.push(
              Faerun.createElement("div", { classes: "legend-element" }, [
                Faerun.createColorBox(v[0]),
                Faerun.createElement("div", {
                  classes: "legend-label",
                  content: v[1],
                }),
              ]),
            );
          });
        } else {
          legendSection.push(
            Faerun.createElement("div", { classes: "legend-element-range" }, [
              ...Faerun.createColorScale(s.legend[index]),
              Faerun.createElement("div", {
                classes: "legend-label max",
                content: s.max_legend_label[index],
              }),
              Faerun.createElement("div", {
                classes: "legend-label min",
                content: s.min_legend_label[index],
              }),
            ]),
          );
        }

        let series = [];
        for (var i = 0; i < s.series_title.length; i++) {
          series.push(
            Faerun.createElement("option", {
              value: i,
              content: s.series_title[i],
              selected: i === index,
            }),
          );
        }

        let sectionHeader = Faerun.createElement("h3", {
          content: s.legend_title[index],
        });
        sectionHeader.addEventListener("click", (e) => {
          this.toggleLegendSection(s.name);
        });

        let seriesSelector = Faerun.createElement(
          "select",
          {
            id: `select-${s.name}`,
            classes: "series-selector",
            "this.data-name": s.name,
            hidden: s.series_title.length < 2,
          },
          [...series],
        );
        seriesSelector.addEventListener("change", (e) => {
          let value = document.getElementById(`select-${s.name}`).value;
          this.changeSeries(value, s.name);
        });

        container.appendChild(
          Faerun.createElement(
            "div",
            {
              id: `legend-${s.name}`,
              classes: "legend-section",
              "this.data-name": `${s.name}`,
            },
            [sectionHeader, seriesSelector, ...legendSection],
          ),
        );
      }
    });
  }

  toggleLegendSection(name) {
    let section = document.getElementById("legend-" + name);
    let geometry = this.pointHelpers[this.phIndexMap[name]].geometry;
    let isVisible = geometry.isVisible;

    if (isVisible) {
      geometry.hide();
      section.style.opacity = 0.5;
    } else {
      geometry.show();
      section.style.opacity = 1.0;
    }
  }

  getSelectedIndex(source, index) {
    let selectedIndex = null;
    this.selectedItems.forEach((item, i) => {
      if (item.source == source && item.item.index == index) {
        selectedIndex = i;
        return;
      }
    });
    return selectedIndex;
  }

  updateSelected(current = -1) {
    let n = this.selectedItems.length;
    // Hide the container if no items are selected
    if (n === 0) {
      this.el.selected.style.display = "none";
      this.selectedIndicators.forEach((indicator) => {
        indicator.element.remove();
      });
      this.selectedIndicators = [];
      return;
    } else {
      this.el.selected.style.display = "block";
    }

    if (current < 0) current = n - 1;
    if (current >= n) current = 0;
    this.selectedCurrent = current;

    let item = this.selectedItems[current];

    let phIndex = this.ohIndexToPhIndex[item.source];
    let meta = this.scatterMeta[phIndex];
    let phName = this.ohIndexToPhName[item.source];
    let seriesState = this.seriesState[phName];

    let fullLabel = this.data[phName].labels[item.item.index].split("__");

    let labelIndex = meta.label_index[seriesState];
    let titleIndex = meta.title_index[seriesState];
    let selectedLabels = meta.selected_labels[seriesState];

    draw_reaction_SMILES(fullLabel[labelIndex], "click");

    this.setSelectedContent(fullLabel, labelIndex, selectedLabels);

    this.el.selectedCurrent.innerHTML = current + 1;
    this.el.selectedTotal.innerHTML = n;
    this.el.selectedTitle.innerHTML = fullLabel[3];

    // Remove all indicators
    this.selectedIndicators.forEach((indicator) => {
      indicator.element.parentElement.removeChild(indicator.element);
    });
    this.selectedIndicators.length = 0;

    // Add the indicator for this object
    let indicatorElement = Faerun.createElement(
      "div",
      { classes: "selected-indicator" },
      [
        Faerun.createElement("div", { classes: "crosshair-x" }),
        Faerun.createElement("div", { classes: "crosshair-y" }),
      ],
    );

    this.body.appendChild(indicatorElement);
    this.selectedIndicators.push({
      element: indicatorElement,
      index: item.item.index,
      ohIndex: item.source,
      phIndex: phIndex,
    });
    this.updateSelectedIndicators();
  }

  updateSelectedIndicators() {
    this.selectedIndicators.forEach((indicator) => {
      let pointSize = this.pointHelpers[indicator.phIndex].getPointSize();
      let screenPosition = this.octreeHelpers[
        indicator.ohIndex
      ].getScreenPosition(indicator.index);

      // Make the crosshairs larger than the point
      pointSize = Faerun.getMax([
        pointSize / window.devicePixelRatio,
        10 / window.devicePixelRatio,
      ]);
      pointSize *= 1.25;
      let halfPointSize = pointSize / 2.0;
      indicator.element.style.left = screenPosition[0] - halfPointSize + "px";
      indicator.element.style.top = screenPosition[1] - halfPointSize + "px";
      indicator.element.style.width = pointSize + "px";
      indicator.element.style.height = pointSize + "px";
    });
  }

  updateTitle(first = false) {
    if (this.el.title === undefined) return;

    let bb = this.el.title.getBoundingClientRect();
    let scenePosition = new Lore.Math.Vector3f(
      (this.min[0] + this.min[0]) / 2.0,
      this.min[1],
      (this.min[2] + this.min[2]) / 2.0,
    );

    let screenPosition = this.lore.controls.camera.sceneToScreen(
      scenePosition,
      this.lore,
    );

    this.el.title.style.left = screenPosition[0] - bb.width / 2.0 + "px";
    this.el.title.style.top = screenPosition[1] - bb.height + "px";

    if (first) this.el.title.classList.add("show");
  }

  updateXAxis(first = false) {
    if (this.el.xAxis === undefined) return;

    let bb = this.el.xAxis.getBoundingClientRect();
    let scenePosition = new Lore.Math.Vector3f(
      (this.min[0] + this.min[0]) / 2.0,
      this.min[1],
      (this.min[2] + this.min[2]) / 2.0,
    );

    let screenPosition = this.lore.controls.camera.sceneToScreen(
      scenePosition,
      this.lore,
    );

    this.el.xAxis.style.left = screenPosition[0] - bb.width / 2.0 + "px";
    this.el.xAxis.style.top = screenPosition[1] + "px";

    if (first) this.el.xAxis.classList.add("show");
  }

  updateYAxis(first = false) {
    if (this.el.yAxis === undefined) return;

    let bb = this.el.yAxis.getBoundingClientRect();
    let scenePosition = new Lore.Math.Vector3f(
      this.min[0],
      (this.min[1] + this.min[1]) / 2.0,
      (this.min[2] + this.min[2]) / 2.0,
    );

    let screenPosition = this.lore.controls.camera.sceneToScreen(
      scenePosition,
      this.lore,
    );

    this.el.yAxis.style.left = screenPosition[0] - bb.height + "px";
    this.el.yAxis.style.top = screenPosition[1] - bb.width / 2.0 + "px";

    if (first) this.el.yAxis.classList.add("show");
  }

  changeSeries(value, name) {
    value = parseInt(value);
    this.seriesState[name] = value;
    this.renderLegend();

    this.pointHelpers[this.phIndexMap[name]].setRGBFromArrays(
      this.data[name]["colors"][value].r,
      this.data[name]["colors"][value].g,
      this.data[name]["colors"][value].b,
    );
    // Update outline
    this.pointHelpers[this.phIndexMap[name] + 1].setRGBFromArrays(
      this.data[name]["colors"][value].r,
      this.data[name]["colors"][value].g,
      this.data[name]["colors"][value].b,
    );
    this.highlightSelectedGroups();
  }

  count_selected_neighborhoods() {
    return this.neighborhoodChecked.filter(Boolean).length;
  }

  count_selected_paths() {
    return this.pathsChecked.filter(Boolean).length;
  }

  get_selected_neighborhoods() {
    return this.neighborhoods.filter((val, i) => this.neighborhoodChecked[i]);
  }

  get_selected_paths() {
    return this.paths.filter((val, i) => this.pathsChecked[i]);
  }

  get_explainer_type() {
    if (d3.select("#neighborhood-explainer").classed("active")) {
      return "n";
    } else if (d3.select("#path-explainer").classed("active")) {
      return "p";
    } else {
      return "";
    }
  }

  disable_lasso() {
    this.isLassoing = false;
    this.lassoEnabled = false;
    d3.select("#lasso-toggle").classed("active", this.lassoEnabled);
    d3.select(".Reaction_Picture").style("display", "block");
    d3.select("#n-selector-info").html("");
    d3.select("#lasso").style("display", "none");
  }

  enable_lasso() {
    this.disable_all_selectors();
    this.lassoEnabled = true;
    d3.select("#lasso-toggle").classed("active", this.lassoEnabled);
    d3.select(".Reaction_Picture").style("display", "none");
    d3.select("#n-selector-info").html(
      "Drag to select neighborhood. <br>Click Lasso again to cancel",
    );
    d3.select("#lasso").style("display", "block");
  }

  disable_subtree_select() {
    this.subtreeSelectEnabled = false;
    this.selectorRoot = null;
    d3.select("#subtree-toggle").classed("active", this.subtreeSelectEnabled);
    d3.select(".Reaction_Picture").style("display", "block");
    d3.select("#n-selector-info").html("");
  }

  enable_subtree_select() {
    this.disable_all_selectors();
    this.subtreeSelectEnabled = true;
    this.selectorRoot = null;
    d3.select("#subtree-toggle").classed("active", this.subtreeSelectEnabled);
    d3.select(".Reaction_Picture").style("display", "none");
    d3.select("#n-selector-info").html(
      "Select root node. <br>Click Subtree again to cancel",
    );
  }

  disable_endpoint_select() {
    this.selectorRoot = null;
    this.endpointSelectEnabled = false;
    d3.select("#endpoint-toggle").classed("active", this.endpointSelectEnabled);
    d3.select(".Reaction_Picture").style("display", "block");
    d3.select("#p-selector-info").html("");
  }

  enable_endpoint_select() {
    this.disable_all_selectors();
    this.endpointSelectEnabled = true;
    this.selectorRoot = null;
    d3.select("#endpoint-toggle").classed("active", this.endpointSelectEnabled);
    d3.select(".Reaction_Picture").style("display", "none");
    d3.select("#p-selector-info").html(
      "Select source node. <br>Click Endpoint again to cancel",
    );
  }

  disable_hd_select() {
    this.hdSelectEnabled = false;
    this.selectorRoot = null;
    d3.select("#hd-toggle").classed("active", this.hdSelectEnabled);
    d3.select(".Reaction_Picture").style("display", "block");
    d3.select("#n-selector-info").html("");
  }

  enable_hd_select() {
    this.disable_all_selectors();
    let self = this;
    this.hdSelectEnabled = true;
    d3.select("#hd-toggle").classed("active", this.hdSelectEnabled);
    d3.select(".Reaction_Picture").style("display", "none");
    d3.select("#n-selector-info").html(
      `<div id="hdslider" style="display: flex; gap: 12px; align-items: center"></div>
      Set \u03B5 radius, then choose a node. <br>Click \u03B5 radius (HD) again to cancel`,
    );
    const width = 100;
    const height = 16;
    let maxVal = 40;

    const svg = d3.select("#hdslider")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("display", "block")
      .style("flex-shrink", "0");

    const scale = d3.scaleLinear()
      .domain([0, maxVal])
      .range([10, width - 10])
      .clamp(true);

    // Track
    svg.append("line")
      .attr("x1", scale(0))
      .attr("x2", scale(maxVal))
      .attr("y1", 8)
      .attr("y2", 8)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 6);

    // Handle
    const handle = svg.append("circle")
      .attr("cx", scale(self.hdEpsVal))
      .attr("cy", 8)
      .attr("r", 8)
      .attr("fill", "steelblue");

    // Editable number label
    const input = d3.select("#hdslider")
      .append("input")
      .attr("type", "number")
      .attr("min", 0)
      .attr("max", maxVal)
      .attr("step", 0.01)
      .attr("value", self.hdEpsVal)
      .style("width", "60px")
      .style("display", "block");

    function update(value, isDrag = false) {
      value = Math.max(0, Math.min(maxVal, +value || 0));
      handle.attr("cx", scale(value));
      if (isDrag) {
        input.property("value", value);
      }
      self.hdEpsVal = value;
    }

    const drag = d3.drag().on("drag", (event) => {
      const x = Math.max(scale(0), Math.min(scale(maxVal), event.x));
      const value = Math.round(scale.invert(x).toFixed(2) * 100) / 100;
      update(value, true);
    });

    handle.call(drag);

    input.on("input", function () {
      update(this.value);
    });
  }

  disable_all_selectors() {
    this.disable_lasso();
    this.disable_subtree_select();
    this.disable_endpoint_select();
    this.disable_hd_select();
  }

  subtree_selection_handler(item) {
    if (this.selectorRoot === null) {
      this.selectorRoot = item;
      d3.select("#n-selector-info").html(
        "Select another node to specify the direction to grow subtree <br>Click Subtree again to cancel",
      );
    } else {
      let selected = this.getSubtree(this.selectorRoot, item);
      this.neighborhoods.push(selected);
      this.renderNeighborhoodList();
      this.disable_subtree_select();
    }
  }

  endpoint_selection_handler(item) {
    if (this.selectorRoot === null) {
      this.selectorRoot = item;
      d3.select("#p-selector-info").html(
        "Select target node to compute path<br>Click Subtree again to cancel",
      );
    } else {
      let selected = this.getEndpointPath(this.selectorRoot, item);
      this.paths.push(selected);
      this.renderPathsList();
      this.disable_endpoint_select();
    }
  }

  hd_selection_handler(item, elements = []) {
    if (elements.length === 0) {
      // send query for epsilon neighborhood
      getHDNeighborhood(item, this.hdEpsVal);
      this.selectorRoot = item;
    } else if (this.hdSelectEnabled && this.selectorRoot === item) {
      this.neighborhoods.push(elements);
      this.renderNeighborhoodList();
      this.disable_hd_select();
    } else {
      console.log(`Returned data for node ${item}`);
      console.log(elements);
    }
  }

  getSubtree(root, seed) {
    //Takes root index and seed index to find all elements in subtree with root as root.
    let selected = [root];
    if (root == seed) {
      return selected;
    }
    // this.data.neighbors
    let toVisit = [seed];
    // loop through and find all adjacent
    while (toVisit.length > 0) {
      seed = toVisit.pop();
      // Mark as visited
      selected.push(seed);

      let neighbors = this.data.neighbors[seed] || [];

      for (let n of neighbors) {
        if (!selected.includes(n) && !toVisit.includes(n)) {
          toVisit.push(n);
        }
      }
    }
    return selected;
  }

  getEndpointPath(source, target) {
    if (source === target) {
      return [source];
    }
    const toVisit = [target];
    const prev = new Map(); // child -> parent
    prev.set(target, -1);
    while (toVisit.length > 0) {
      const node = toVisit.pop();
      if (node === source) {
        const path = [];
        let cur = source;

        while (cur !== -1) {
          path.push(cur);
          cur = prev.get(cur);
        }
        return path;
      }
      const neighbors = this.data.neighbors[node] || [];
      for (const nei of neighbors) {
        if (!prev.has(nei)) {
          prev.set(nei, node);
          toVisit.push(nei);
        }
      }
    }
    return [source];
  }

  highlightSelectedGroups() {
    const etype = this.get_explainer_type();
    if (etype === "n") {
      this.highlightNodes(this.neighborhoods, this.neighborhoodChecked);
    } else if (etype === "p") {
      this.highlightNodes(this.paths, this.pathsChecked, true);
    }
  }

  highlightNodes(indexes, show = [true, true], isPath = false) {
    let value = document.getElementById(`select-ReactionAtlas`).value;
    let baseColors = this.data["ReactionAtlas"]["colors"][parseInt(value)];

    let r, g, b, or, og, ob, c, s;
    const length = this.data[this.treeMeta[0].name].x.length;
    let origColor = Lore.Core.Color.hexToFloat(this.treeMeta[0].color);
    if (this.unselectedToggle && show.filter(Boolean).length > 0) {
      const len = baseColors.r.length;
      r = new Array(len).fill(255);
      g = new Array(len).fill(255);
      b = new Array(len).fill(255);
      or = new Array(len).fill(255);
      og = new Array(len).fill(255);
      ob = new Array(len).fill(255);
      
      for (let j = 0; j < indexes.length; j++) {
        if (show[j]) {
          indexes[j].forEach((i) => {
            r[i] = baseColors.r[i];
            g[i] = baseColors.g[i];
            b[i] = baseColors.b[i];
          });
        }
      }
      c = new Float32Array(length).fill(Lore.Core.Color.hexToFloat("#FFFFFF"));
      s = new Float32Array(length).fill(1.0);
    } else {
      r = baseColors.r.slice();
      g = baseColors.g.slice();
      b = baseColors.b.slice();

      or = r.slice();
      og = g.slice();
      ob = b.slice();
      c = new Float32Array(length).fill(origColor);
      s = new Float32Array(length).fill(1.0);
    }

    let overlap = new Array(r.length).fill(false);

    const opacity = 0.0;
    let outline = [77,191,143];
    const overlapColor = [31,92,44];
    const outline2 = [0,0,0];//[0, 0, 100];

    let edgeColor = Lore.Core.Color.rgbToFloat(...outline);
    let edgeOverlap = Lore.Core.Color.rgbToFloat(...overlapColor);
    let edgeColor2 = Lore.Core.Color.rgbToFloat(...outline2);
    let outlierColor = Lore.Core.Color.hexToFloat("#FF0000");
    let floatColor = edgeColor;

    for (let j = 0; j < indexes.length; j++) {
      let edgelist = this.data["incident_edges"];
      if (show[j]) {
        indexes[j].forEach((i) => {
          r[i] = Math.floor(r[i] * (1.0 - opacity) + outline[0] * opacity);
          g[i] = Math.floor(g[i] * (1.0 - opacity) + outline[1] * opacity);
          b[i] = Math.floor(b[i] * (1.0 - opacity) + outline[2] * opacity);

          if (overlap[i]) {
            or[i] = overlapColor[0];
            og[i] = overlapColor[1];
            ob[i] = overlapColor[2];
            floatColor = edgeOverlap;
          } else {
            or[i] = outline[0];
            og[i] = outline[1];
            ob[i] = outline[2];
            overlap[i] = true;
            floatColor = edgeColor;
          }
          edgelist[i].forEach((k) => {
            c[k] = floatColor;
            // check other
            // original means might be outlier
            // otherwise leave as is.
            if (!isPath) {
              if (k % 2 === 1) {
                if (c[k - 1] === origColor) {
                  c[k - 1] = outlierColor;
                }
              } else if (c[k + 1] === origColor) {
                c[k + 1] = outlierColor;
              }
            }
          });
        });
      }
      outline = outline2;
      edgeColor = edgeColor2;
    }
    this.pointHelpers[0].setRGBFromArrays(r, g, b);
    this.pointHelpers[1].setRGBFromArrays(or, og, ob);

    this.treeHelpers[0]._setValues(
      this.data[this.treeMeta[0].name].x,
      this.data[this.treeMeta[0].name].y,
      this.data[this.treeMeta[0].name].z,
      c,
      s,
    );
  }

  searchTerm(term) {
    let results = this.data["ReactionAtlas"]["labels"]
      .map((rxn, i) => {
        return rxn.split("__")[0].includes(term) ? i : -1;
      })
      .filter(i => i !== -1);

    return results;
  }

  get_default_prompt() {
    let res = " ";
    let supervised_edit = this.supervised_explanation
      ? "reaction SMILES (with reaction class labels)"
      : "reaction SMILES";
    if (d3.select("#neighborhood-explainer").classed("active")) {
      if (this.count_selected_neighborhoods() > 1) {
        // compare
        res = `You are a computational chemist analyzing two neighborhoods of ${supervised_edit} representing related transformations.
Analyze the transition between neighborhoods by:
(1) Identifying shared reactants, products, catalysts, or functional group transformations (if any).
(2) Highlighting differences in mechanisms or structures.
(3) Summarizing how one neighborhood shifts into the other (if there is overlap).`;
      } else if (this.count_selected_neighborhoods() > 0) {
        // summary
        res = `You are a computational chemist analyzing chemical reactions given as ${supervised_edit}.
Identify:
- Common reaction types or mechanisms
- Shared functional group transformations
- Recurring bond changes or reagents
- The chemical rationale for grouping these reactions together
Focus on patterns common across the set, not individual reactions. Include brief examples of recurring transformations where helpful.`;
      } else {
        showBanner(
          "Must select at least one neighborhood to get summary/comparison",
          "danger"
        );
      }
    } else if (d3.select("#path-explainer").classed("active")) {
      if (this.count_selected_paths() > 1) {
        res = `You are a computational chemist analyzing how reaction patterns evolve across two reaction pathways represented as sequences of ${supervised_edit}.
Your task:
- Identify recurring motifs within each pathway
- Compare patterns across the two pathways
- Highlight whether transformations are analogous or mechanistically distinct between pathways
Explicitly cite representative reaction SMILES or fragments from each pathway. 
Point to specific molecules or substructures that illustrate the pattern.
`;
      } else if (this.count_selected_paths() > 0) {
        res = `You are a computational chemist analyzing how reactions evolve across a sequence of reactions, represented by ${supervised_edit}. 
Identify specific recurring reactants, products, catalysts, reagents, or functional group changes that are shared within and across reactions. 
Clearly reference representative reactants, catalysts, or products.`;
      } else {
        showBanner("Must select at least one path to get summary/comparison", "danger");
      }
    } else {
      showBanner("Must have Neighborhood Explainer or Path Explainer selected", "danger");
    }
    return res;
  }

  static createColorBox(value) {
    return Faerun.createElement("div", {
      classes: "color-box",
      style: `background-color: rgba(${value[0] * 255}, ${value[1] * 255}, ${value[2] * 255}, ${value[3]});
                    border-color: rgba(${value[0] * 255}, ${value[1] * 255}, ${value[2] * 255}, ${value[3]})`,
    });
  }

  static createColorScale(values) {
    let scale = [];

    values.forEach((value) => {
      scale.push(
        Faerun.createElement("div", {
          classes: "color-stripe",
          style: `background-color: rgba(${value[0][0] * 255}, ${value[0][1] * 255}, ${value[0][2] * 255}, ${value[0][3]});
                        border-color: rgba(${value[0][0] * 255}, ${value[0][1] * 255}, ${value[0][2] * 255}, ${value[0][3]})`,
          alt: value[1],
        }),
      );
    });

    return scale;
  }

  static createElement(tag, values = {}, children = []) {
    let element = document.createElement(tag);

    for (const key of Object.keys(values)) {
      if (key === "classes") element.classList.add(...values[key].split(" "));
      else if (key === "content") element.innerHTML = values[key];
      else if (key === "hidden") {
        if (values[key]) element.setAttribute("hidden", true);
      } else if (key === "selected") {
        if (values[key]) element.setAttribute("selected", true);
      } else element.setAttribute(key, values[key]);
    }

    if (children) {
      if (Array.isArray(children)) {
        children.forEach((child) => {
          element.appendChild(child);
        });
      } else {
        element.appendChild(children);
      }
    }

    return element;
  }

  static bindElements() {
    let result = {};
    document.querySelectorAll("[data-bind]").forEach((e) => {
      result[e.getAttribute("data-bind")] = e;
    });
    return result;
  }

  static getMin(arr, other = Number.MAX_VALUE) {
    let m = Number.MAX_VALUE;
    for (var i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i];

    if (m < other) return m;
    return other;
  }

  static getMax(arr, other = -Number.MAX_VALUE) {
    let m = -Number.MAX_VALUE;
    for (var i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];

    if (m > other) return m;
    return other;
  }
}
