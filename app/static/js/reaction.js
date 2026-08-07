let smilesDrawer = new SmilesDrawer.Drawer({
  width: 150 / window.devicePixelRatio,
  height: 150 / window.devicePixelRatio,
  experimental: true,
  resizemode: false,
  fontSizeLarge: 11,
  fontSizeSmall: (3 / 5) * 11,
  bondThickness: 1.4,
  bondLength: 25,
  shortBondLength: 75 / 100,
  bondSpacing: 4,
  size: 300,
  overlapResolutionIterations: 1,
  atomVisualization: "default",
  compactDrawing: false,
  debug: false,
  resizemode: false,
  explicitHydrogens: true
});
var Reactant_Left__Count = 0;
var Reactant_Arrow__Count = 0;
var Reactant_Arrow_Vis__Count = 0;
var Product__Count = 0;

var log = document.getElementById("log");

function clearReactionPicture() {
  Reactant_Left__Count = 0;
  Reactant_Arrow__Count = 0;
  Reactant_Arrow_Vis__Count = 0;
  Product__Count = 0;
  d3.select(".Reaction_Picture")
    .selectAll("div")
    .html("");
}

function draw_reaction_SMILES(reaction_SMILES, origin_Update = "") {
    if(log == null) {
        log = document.getElementById("log");
    };
  //console.log('From : ' + origin_Update + ' SMILES: ' + reaction_SMILES)
  var source_input = reaction_SMILES;
  source_input = source_input.replace(/~/g, ".");
  //console.log('after replacment: '+ source_input)

  //   ****************   HIDE CANVAS   ****************
  if (Reactant_Left__Count > 0) {
    for (i = 1; i <= Reactant_Left__Count; i++) {
      document.getElementById("output-canvas-reactant-left-" + i).width = 0;
      document.getElementById("output-canvas-reactant-left-" + i).height = 0;
      document.getElementById("Reactant_plus-" + i).width = 0;
      document.getElementById("Reactant_plus-" + i).height = 0;
    }
  }
  if (Reactant_Arrow__Count > 0) {
    for (i = 1; i <= Reactant_Arrow__Count; i++) {
      document.getElementById("output-canvas-reactant-arrow-" + i).width = 0;
      document.getElementById("output-canvas-reactant-arrow-" + i).height = 0;
    }
  }
  if (Product__Count > 0) {
    for (i = 1; i <= Product__Count; i++) {
      document.getElementById("output-canvas-product-" + i).width = 0;
      document.getElementById("output-canvas-product-" + i).height = 0;
    }
  }
  removeElementsByClass("block_Arrow");
  removeElementsByClass("ArrowCanva");
  //*****************************************************

  if (source_input.includes(">>")) //REACTION: SPLIT BY >> 2 treatments
  {
    //get left SMILES:
    Reactants_Left_SMILES = source_input.split(">>")[0];
    draw_reactant_left(Reactants_Left_SMILES);

    //get product SMILES:
    Product_SMILES = source_input.split(">>")[1];
    if (Product_SMILES != "") {
      draw_products(Product_SMILES);
    }

    created_arrow_WhenNoReactantOnArrow();
  } else if (source_input.includes(">")) //REACTION: SPLIT BY > 3 treatments
  {
    var string_split = source_input.split(">");

    if (string_split.length == 2) {
      Reactants_Left_SMILES = source_input.split(">")[0];
      draw_reactant_left(Reactants_Left_SMILES);

      Reactant_Arrow = source_input.split(">")[1];
      if (Reactant_Arrow != "") {
        draw_reactant_arrow(Reactant_Arrow);
        Get_Max_Height();
      }
    }

    if (string_split.length == 3) {
      Reactants_Left_SMILES = source_input.split(">")[0];
      draw_reactant_left(Reactants_Left_SMILES);

      Reactant_Arrow = source_input.split(">")[1];
      if (Reactant_Arrow != "") {
        draw_reactant_arrow(Reactant_Arrow);
        Get_Max_Height();
      }

      Product_SMILES = source_input.split(">")[2];
      if (Product_SMILES != "") {
        draw_products(Product_SMILES);
      }
    }
  } else //FOR SIMPLE MOLECULES (For Retro-compatibility):
  {
    Reactants_Left_SMILES = source_input;
    draw_reactant_left(Reactants_Left_SMILES);
  }
}

function draw_reactant_left(smiles) {
  //Split "."" and draw For each reactant

  if (smiles.includes(".")) {
    //Split the reactants and create
    var Split_Reactant = smiles.split(".");
    for (i = 0; i < Split_Reactant.length; i++) {
      if (Split_Reactant[i] != "") {
        if (Reactant_Left__Count < i + 1) {
          //If total count of reactant left is not sufficent, then create a new canvas for the new reactant
          var canvas_test = document.createElement("canvas");

          canvas_test.id = "output-canvas-reactant-left-" + (i + 1);
          canvas_test.style =
            "background-color: rgb(210, 210, 210); vertical-align: middle";
          canvas_test.style = "vertical-align: middle";
          //canvas_test.style="vertical-align: middle";
          //canvas_test.width = 50;
          //canvas_test.height = 50;
          canvas_test.style.position = "inline-block";
          canvas_test.style.border = "px solid";
          //canvas_test.style.vertical-align = "middle";

          var body = document.getElementsByClassName(
            "canvas-container_Reactant_Left",
          )[0];
          body.appendChild(canvas_test);

          Reactant_Left__Count = Reactant_Left__Count + 1;

          if (i < Split_Reactant.length) {
            //DRAW the plus "+" sign after the product (if not the last one):
            var plus_lenght = 20;
            var plus_height = 60;
            var plus_top = plus_height / 2;

            var plus_element = document.createElement("canvas");

            plus_element.id = "Reactant_plus-" + (i + 1);
            plus_element.style = "vertical-align: middle";
            plus_element.width = plus_lenght;
            plus_element.height = plus_height;
            plus_element.style.border = "px solid";

            var body = document.getElementsByClassName(
              "canvas-container_Reactant_Left",
            )[0];
            body.appendChild(plus_element);
          }
        }

        //DRAW the molecule in the target canvas:
        SmilesDrawer.parse(
          Split_Reactant[i],
          function (tree) {
            smilesDrawer.draw(
              tree,
              "output-canvas-reactant-left-" + (i + 1),
              "light",
              false,
            );
            //let td = performance.now() - t;
            log.innerHTML = "&nbsp;";
            log.style.visibility = "hidden";
          },
          function (err) {
            log.innerHTML = err;
            log.style.visibility = "visible";
            console.log(err);
          },
        );

        if (i < Split_Reactant.length - 1) {
          //DRAW the plus "+" sign after the product (if not the last one):
          var plus_lenght = 20;
          var plus_height = 60;
          var plus_top = plus_height / 2;

          var plus_element = document.getElementById(
            "Reactant_plus-" + (i + 1),
          );
          plus_element.width = plus_lenght;
          plus_element.height = plus_height;
          plus_element.style = "vertical-align: middle";
          var ctx = plus_element.getContext("2d");

          ctx.lineWidth = 2;
          ctx.moveTo(2, plus_top);
          ctx.lineTo(plus_lenght - 4, plus_top);
          ctx.strokeStyle = "black";

          ctx.moveTo(plus_lenght / 2 - 1, plus_top - plus_lenght / 2 + 3);
          ctx.lineTo(plus_lenght / 2 - 1, plus_top + plus_lenght / 2 - 3);
          ctx.strokeStyle = "black";

          ctx.stroke();
        }
      }
    }
  } else {
    if (Reactant_Left__Count < 1) {
      var canvas_test = document.createElement("canvas");

      canvas_test.id = "output-canvas-reactant-left-1";
      canvas_test.style =
        "background-color: rgb(210, 210, 210); vertical-align: middle";
      canvas_test.style = "vertical-align: middle";
      //canvas_test.width = 50;
      //canvas_test.height = 50;
      canvas_test.style.position = "inline-block";
      canvas_test.style.border = "px solid";

      var body = document.getElementsByClassName(
        "canvas-container_Reactant_Left",
      )[0];
      body.appendChild(canvas_test);

      Reactant_Left__Count = 1;
    }

    SmilesDrawer.parse(
      smiles,
      function (tree) {
        smilesDrawer.draw(tree, "output-canvas-reactant-left-1", "light", false);
        //let td = performance.now() - t;
        log.innerHTML = "&nbsp;";
        log.style.visibility = "hidden";
      },
      function (err) {
        log.innerHTML = err;
        log.style.visibility = "visible";
        console.log(err);
      },
    );
  }
}

function draw_reactant_arrow(smiles) {
  //UPDATE OPTIONS:
  options.width = parseInt(options.width / 2 - 8);
  options.height = parseInt(options.height / 2 - 8);

  smilesDrawer = new SmilesDrawer.Drawer(options);

  Reactant_Arrow_Vis__Count = 0;

  if (smiles.includes(".")) {
    //Split the reactants and create
    var Split_Reactant = smiles.split(".");

    for (i = 0; i < Split_Reactant.length; i++) {
      if (Split_Reactant[i] != "") {
        if (Reactant_Arrow__Count < i + 1) {
          var canvas_test = document.createElement("canvas");

          canvas_test.id = "output-canvas-reactant-arrow-" + (i + 1);
          canvas_test.style =
            "background-color: rgb(210, 210, 210); vertical-align: middle";
          canvas_test.style = "vertical-align: middle";
          canvas_test.width = 50;
          canvas_test.height = 50;
          canvas_test.style.position = "inline-block";
          canvas_test.style.border = "px solid";

          var body = document.getElementsByClassName(
            "canvas-container_Reactant_Arrow",
          )[0];
          body.appendChild(canvas_test);

          Reactant_Arrow__Count = Reactant_Arrow__Count + 1;
        }

        //DRAW:
        SmilesDrawer.parse(
          Split_Reactant[i],
          function (tree) {
            smilesDrawer.draw(
              tree,
              "output-canvas-reactant-arrow-" + (i + 1),
              "light",
              false,
            );
            //let td = performance.now() - t;
            log.innerHTML = "&nbsp;";
            log.style.visibility = "hidden";
          },
          function (err) {
            log.innerHTML = err;
            log.style.visibility = "visible";
            console.log(err);
          },
        );

        Reactant_Arrow_Vis__Count++;
      }
    }
  } else {
    if (Reactant_Arrow__Count < 1) {
      var canvas_test = document.createElement("canvas");

      canvas_test.id = "output-canvas-reactant-arrow-1";
      canvas_test.style =
        "background-color: rgb(210, 210, 210); vertical-align: middle";
      canvas_test.style = "vertical-align: middle";
      canvas_test.width = 50;
      canvas_test.height = 50;
      canvas_test.style.position = "inline-block";
      canvas_test.style.border = "px solid";

      var body = document.getElementsByClassName(
        "canvas-container_Reactant_Arrow",
      )[0];
      body.appendChild(canvas_test);

      Reactant_Arrow__Count = 1;
    }

    SmilesDrawer.parse(
      smiles,
      function (tree) {
        smilesDrawer.draw(
          tree,
          "output-canvas-reactant-arrow-1",
          "light",
          false,
        );
        //let td = performance.now() - t;
        log.innerHTML = "&nbsp;";
        log.style.visibility = "hidden";
      },
      function (err) {
        log.innerHTML = err;
        log.style.visibility = "visible";
        console.log(err);
      },
    );

    Reactant_Arrow_Vis__Count++;
  }

  //UPDATE OPTIONS:
  options.width = parseInt((options.width + 8) * 2);
  options.height = parseInt((options.height + 8) * 2);
  smilesDrawer = new SmilesDrawer.Drawer(options);

  // ////////////     ARROW     ////////////
  var arrow_lenght = Get_sum_width(); //(Reactant_Arrow_Vis__Count * parseInt(options.width/2)+8);
  var arrow_height = 18 - 4 + Get_Max_Height(); //(0.5*parseInt(options.width)+8) - 4;
  var arrow_top = 8;

  if (arrow_lenght < 160) {
    arrow_lenght = 160;
  }

  // Your existing code unmodified...
  var iDiv = document.createElement("div");
  //iDiv.style="background-color: rgb(100, 200, 100)";
  iDiv.id = "block_Arrow";
  iDiv.className = "block_Arrow";
  iDiv.style.position = "relative";
  document
    .getElementsByClassName("canvas-container_Reactant_Arrow")[0]
    .appendChild(iDiv);

  var arrow_test = document.createElement("canvas");

  arrow_test.id = "ArrowCanva";
  arrow_test.width = arrow_lenght;
  arrow_test.height = arrow_height;
  //arrow_test.style.position = "static";
  arrow_test.style.border = "px solid";

  var body = document.getElementsByClassName("block_Arrow")[0];
  body.appendChild(arrow_test);

  arrow_drawing("ArrowCanva", arrow_top, arrow_lenght);
}

function draw_products(smiles) {
  if (smiles.includes(".")) {
    //Split the reactants and create
    var Split_Reactant = smiles.split(".");

    for (i = 0; i < Split_Reactant.length; i++) {
      if (Split_Reactant[i] != "") {
        if (Product__Count < i + 1) {
          var canvas_test = document.createElement("canvas");

          canvas_test.id = "output-canvas-product-" + (i + 1);
          canvas_test.style =
            "background-color: rgb(210, 210, 210); vertical-align: middle";
          canvas_test.style = "vertical-align: middle";
          canvas_test.width = 50;
          canvas_test.height = 50;
          canvas_test.style.position = "inline-block";
          canvas_test.style.border = "px solid";

          var body = document.getElementsByClassName(
            "canvas-container_Product",
          )[0];
          body.appendChild(canvas_test);

          Product__Count = Product__Count + 1;
        }

        //DRAW:
        SmilesDrawer.parse(
          Split_Reactant[i],
          function (tree) {
            smilesDrawer.draw(
              tree,
              "output-canvas-product-" + (i + 1),
              "light",
              false,
            );
            //let td = performance.now() - t;
            log.innerHTML = "&nbsp;";
            log.style.visibility = "hidden";
          },
          function (err) {
            log.innerHTML = err;
            log.style.visibility = "visible";
            console.log(err);
          },
        );
      }
    }
  } else {
    if (Product__Count < 1) {
      var canvas_test = document.createElement("canvas");

      canvas_test.id = "output-canvas-product-1";
      canvas_test.style =
        "background-color: rgb(210, 210, 210); vertical-align: middle";
      canvas_test.style = "vertical-align: middle";
      canvas_test.width = 50;
      canvas_test.height = 50;
      canvas_test.style.position = "inline-block";
      canvas_test.style.border = "px solid";

      var body = document.getElementsByClassName("canvas-container_Product")[0];
      body.appendChild(canvas_test);

      Product__Count = 1;
    }

    SmilesDrawer.parse(
      smiles,
      function (tree) {
        smilesDrawer.draw(tree, "output-canvas-product-1", "light", false);
        //let td = performance.now() - t;
        log.innerHTML = "&nbsp;";
        log.style.visibility = "hidden";
      },
      function (err) {
        log.innerHTML = err;
        log.style.visibility = "visible";
        console.log(err);
      },
    );
  }
}

function created_arrow_WhenNoReactantOnArrow() {
  var arrow_lenght = 100;
  var arrow_height = 20;
  var arrow_top = 12; //(parseInt(options.width)/2)-15

  var arrow_test = document.createElement("canvas");

  arrow_test.id = "ArrowCanva";
  arrow_test.className = "ArrowCanva";
  arrow_test.width = arrow_lenght;
  arrow_test.height = arrow_height;
  arrow_test.style.border = "px solid";

  var body = document.getElementsByClassName(
    "canvas-container_Reactant_Arrow",
  )[0];
  body.appendChild(arrow_test);

  arrow_drawing("ArrowCanva", arrow_top, arrow_lenght);
}

function arrow_drawing(ArrowCanva, arrow_middle_height, arrow_lenght) {
  arrow_lenght = arrow_lenght - 10;

  var arrow = document.getElementById("ArrowCanva");
  var ctx = arrow.getContext("2d");

  ctx.lineWidth = 2;
  ctx.moveTo(0, arrow_middle_height);
  ctx.lineTo(arrow_lenght, arrow_middle_height);
  ctx.strokeStyle = "black";
  ctx.stroke();

  //ARROW HEAD:
  var __head_width = 19;
  var __head_low_width = 15;
  var __head_half_height = 5;

  ctx.beginPath();
  ctx.moveTo(arrow_lenght, arrow_middle_height);
  ctx.lineTo(
    arrow_lenght - __head_width,
    arrow_middle_height - __head_half_height,
  );
  ctx.lineTo(arrow_lenght - __head_low_width, arrow_middle_height);
  ctx.lineTo(
    arrow_lenght - __head_width,
    arrow_middle_height + __head_half_height,
  );
  ctx.closePath();
  // turn inside "black"
  ctx.fillStyle = "rgba(0, 0, 0, 255)";
  //ctx.fillStyle = "#000000";
  ctx.fill();

  ctx.stroke();
}

function removeElementsByClass(className) {
  var elements = document.getElementsByClassName(className);
  while (elements.length > 0) {
    elements[0].parentNode.removeChild(elements[0]);
  }
}

function Get_Max_Height() {
  var elements = document.getElementsByClassName(
    "canvas-container_Reactant_Arrow",
  );
  var max_height = 0;
  var current_height = 0;

  if (Reactant_Arrow__Count > 0) {
    for (i = 1; i <= Reactant_Arrow__Count; i++) {
      current_height = document.getElementById(
        "output-canvas-reactant-arrow-" + i,
      ).height;
      if (current_height > max_height) {
        max_height = current_height;
      }
    }
  }

  //console.log(max_height);
  return max_height;
}

function Get_sum_width() {
  var elements = document.getElementsByClassName(
    "canvas-container_Reactant_Arrow",
  );
  var sum_width = 0;
  var current_width = 0;

  if (Reactant_Arrow__Count > 0) {
    for (i = 1; i <= Reactant_Arrow__Count; i++) {
      current_width = document.getElementById(
        "output-canvas-reactant-arrow-" + i,
      ).width;
      sum_width += current_width;
    }
  }

  //console.log(sum_width);
  return sum_width;
}
