# Reaction Map Generator

The `mst_generator.py` file generates **2D coordinates of MST** from descriptor vectors and exports them for visualization (e.g., with **Faerun**).

The script supports multiple dimensionality-reduction methods to use as coordinates:

* **MST** (force directed)
* **UMAP**
* **t-SNE**
* **PCA**

---

# 1. Create the Conda Environment

### Create environment

```bash
conda create -n rxnmap python=3.9 -y
conda activate rxnmap
```

### Install dependencies

```bash
pip install -r requirements.txt
conda install --channel conda-forge pygraphviz
```

# 2. Input Data Format

The input file should be a **CSV file containing reaction descriptors**.

Example structure:

```
d1,d2,d3,...,d256, Rxn, Rxn_Class
0.23,0.11,...,0.1, string, string
0.18,0.09,...,0.2, string, string
```

Requirements:

* Column **`Rxn`** contains reaction SMILES
* Column **`Rxn_Class`** contains reaction class (e.g. 6.3.1)
* First **256 descriptor columns** are used for coordinate generation

---

# 3. Running the Script

Basic usage:

```bash
python mst_generator.py input.csv
```

This will:

* Generate **MST coordinates**
* Save output to a default CSV file.

---

# 4. Command Line Arguments

## Required argument

### `input`

Input CSV file containing reaction descriptors.

Example:

```
python mst_generator.py ./data/schneiderCanon_w_descs.csv
```

---

## Optional arguments

### `--output`

Specify the output file name.

Example:

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --output ./mst/outputname
```

Output format:

```
Rxn,x,y
CCO>>CC=O,-12.3,4.5
CCC>>CC=C,-10.1,5.2
```

---

### `--coords`

Select the dimensionality-reduction method.

Options:

```
mst
umap
tsne
pca
```

Default:

```
mst
```

### `--save-mst`

Save the computed mst to a .npz file, can be used later. Saves to the `./mst/` folder

Example:
```
python .\mst_generator.py .\data\schneiderCanon_w_descs.csv -o mst --save-mst mst.npz
```

### `--load-mst`

Load a mst precomputed file.

Example:
```
python .\mst_generator.py .\data\schneiderCanon_w_descs.csv -o mst --load-mst ./mst/mst.npz
```

#### UMAP

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --coords umap
```

#### t-SNE

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --coords tsne
```

#### PCA

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --coords pca
```

---

# 5. Example Commands

### Generate MST map

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --output mst
```

### Generate UMAP map

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --coords umap --output umapOutput
```

### Generate t-SNE map

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --coords tsne --output tsneOutput
```

### Generate PCA map

```bash
python mst_generator.py ./data/schneiderCanon_w_descs.csv --coords pca --output pca_coords.csv
```

---

# 6. Output

The script generates a CSV file containing:

```
Rxn,x,y
```

Where:

* **Rxn** = reaction SMILES
* **x,y** = 2D coordinates from the chosen method

These coordinates can be used for:

* **Faerun interactive maps**
* **matplotlib visualizations**
* **chemical space exploration**

---

# 7. Troubleshooting

### `PackagesNotFoundError: umap`

Install using:

```
conda install -c conda-forge umap-learn
```

---

### Environment conflicts

Recreate environment:

```
conda remove -n rxnmap --all
conda create -n rxnmap python=3.9
```

---

# 8. Recommended Workflow

```
1. Prepare descriptor CSV
2. Create conda environment
3. Run coordinate generation
4. Visualize coordinates
```

---

# 9. Example Project Structure

```
project/
│
├── mst_generator.py
├── README.md
├── data/
│   └── ./data/schneiderCanon_w_descs.csv
└── mst/
    └── [output location]
```

---
