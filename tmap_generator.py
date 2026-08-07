import json
import numpy as np
import pandas as pd
import tmap as tm
from tqdm import tqdm 
from faerun import Faerun
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import argparse

from scipy import stats
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, Descriptors3D
from matplotlib.colors import LinearSegmentedColormap

from sklearn.decomposition import PCA
from umap import UMAP


parser = argparse.ArgumentParser(description="Generate interactive TMAP")

parser.add_argument(
    "input",
    type=str,
    help="Input CSV file"
)

parser.add_argument(
    "--output",
    "-o",
    default="",
    help="Output filename"
)

parser.add_argument(
    "--coords",
    choices=["tmap", "umap", "tsne", "pca"],
    default="tmap",
    help="Coordinate generation method (default: tmap)"
)
rand_seed = 51
args = parser.parse_args()
output_file = args.output if len(args.output) > 0 else args.coords

lf = tm.LSHForest(256, 128)
mh_encoder = tm.Minhash()
with open('./data/rxnclass2name.json', 'r') as f:
    rxnclass2name = json.load(f)
schneider_df = pd.read_csv(args.input) # was './rxn_data/schneiderCanon_w_descs.csv'
ft_10k_fps = schneider_df.iloc[:, :256].to_numpy(dtype=float)
schneider_df = schneider_df[["Rxn", "Rxn_Class"]]
schneider_df['rxn_category'] = schneider_df.Rxn_Class.apply(lambda x: '.'.join(x.split('.')[:2]))
schneider_df['rxn_superclass'] = schneider_df.Rxn_Class.apply(lambda x: x.split('.')[0])
# print(schneider_df.head().iloc[:, 256:])

mhfps = [mh_encoder.from_weight_array(fp.tolist(), method="I2CWS") for fp in tqdm(ft_10k_fps, leave=False)]

# slow

labels = []
# superclasses
superclasses = []
category = []
rclass = []

# product properties
tpsa = []
logp = []
mw = []
h_acceptors = []
h_donors = []
ring_count = []

# metals in precursors
has_Pd = []
has_Li = []
has_Mg = []
has_Al = []
l2norm = np.linalg.norm(ft_10k_fps, axis=1)

for i, row in tqdm(schneider_df.iterrows(), leave=False):

    rxn = row["Rxn"]
    labels.append(
        str(rxn)
        + "__"
        + str(rxn)
        + f"__{l2norm[i]}"
        + f"__{rxnclass2name[row['Rxn_Class']]} - {row['Rxn_Class']}"
        + f"__{rxnclass2name[row['rxn_category']]}"
        + f"__{rxnclass2name[row['rxn_superclass']]}"
    )
    superclasses.append(int(row["rxn_superclass"]))
    category.append(float(row["rxn_category"]))
    rclass.append(row["Rxn_Class"])
    
    precursors, products = rxn.split('>>')

    mol = Chem.MolFromSmiles(products)
            
    tpsa.append(Descriptors.TPSA(mol))
    logp.append(Descriptors.MolLogP(mol))
    mw.append(Descriptors.MolWt(mol))
    h_acceptors.append(Descriptors.NumHAcceptors(mol))
    h_donors.append(Descriptors.NumHDonors(mol))
    ring_count.append(Descriptors.RingCount(mol))
    
    has_Pd.append('Pd' in precursors)
    has_Li.append('Li' in precursors)
    has_Mg.append('Mg' in precursors)
    has_Al.append('Al' in precursors)
tpsa_ranked = stats.rankdata(np.array(tpsa) / max(tpsa)) / len(tpsa)
logp_ranked = stats.rankdata(np.array(logp) / max(logp)) / len(logp)
mw_ranked = stats.rankdata(np.array(mw) / max(mw)) / len(mw)
h_acceptors_ranked = stats.rankdata(np.array(h_acceptors) / max(h_acceptors)) / len(
    h_acceptors
)
h_donors_ranked = stats.rankdata(np.array(h_donors) / max(h_donors)) / len(h_donors)
ring_count_ranked = stats.rankdata(np.array(ring_count) / max(ring_count)) / len(
    ring_count
)

labels_groups, groups = Faerun.create_categories(superclasses)
labels_groups = [(label[0], f"{label[1]} - {rxnclass2name[str(label[1])]}") for label in labels_groups]

ctg_labels, ctg_groups = Faerun.create_categories(category)
ctg_labels = [(label[0], f"{label[1]} - {rxnclass2name[str(label[1])]}") for label in ctg_labels]

class_labels, class_groups = Faerun.create_categories(rclass)
class_labels = [(label[0], f"{label[1]} - {rxnclass2name[str(label[1])]}") for label in class_labels]

with tqdm(total=1, desc="Computing LSH", unit="step", leave=False) as pbar:
    # slow
    lf.batch_add(mhfps)
    lf.index()

    # Layout
    cfg = tm.LayoutConfiguration()
    cfg.k = 50
    cfg.kc = 50
    cfg.sl_scaling_min = 1.0
    cfg.sl_scaling_max = 1.0
    cfg.sl_repeats = 1
    cfg.sl_extra_scaling_steps = 2
    cfg.placer = tm.Placer.Barycenter
    cfg.merger = tm.Merger.LocalBiconnected
    cfg.merger_factor = 2.0
    cfg.merger_adjustment = 0
    cfg.fme_iterations = 1000
    cfg.sl_scaling_type = tm.ScalingType.RelativeToDesiredLength
    cfg.node_size = 1 / 37
    cfg.mmm_repeats = 1


    # Get tree coordinates, s & t are links
    x, y, s, t, _ = tm.layout_from_lsh_forest(lf, config=cfg)
    pbar.update(1)

with tqdm(total=1, desc=f"Computing Coords ({args.coords})", unit="step", leave=False) as pbar:
    # Save to CSV
    if (args.coords == "tmap"):
        pass
    elif (args.coords == "umap"):
        reducer = UMAP(n_components=2, random_state=rand_seed)
        coords = reducer.fit_transform(ft_10k_fps)
        x = coords[:, 0]
        y = coords[:, 1]
    elif (args.coords == "tsne"):
        
        # from openTSNE import TSNE
        # tsne = TSNE(n_components=2,n_jobs=-1,negative_gradient_method='fft')
        # coords = tsne.fit(ft_10k_fps)
        
        from sklearn.manifold import TSNE
        tsne = TSNE(n_components=2, random_state=rand_seed)
        coords = tsne.fit_transform(ft_10k_fps)
        x = coords[:, 0]
        y = coords[:, 1]
    elif (args.coords == "pca"):
        coords = PCA(n_components=2).fit_transform(ft_10k_fps)
        x = coords[:, 0]
        y = coords[:, 1]
    
    result_df = pd.DataFrame({
        "x": x,
        "y": y
    })
    result_df.to_csv(f"./tmap/{args.coords}_coords.csv", index=False)
    pbar.update(1)

# Define colormaps
set1 = plt.get_cmap("Set1").colors
rainbow = plt.get_cmap("turbo")
colors = rainbow(np.linspace(0, 1, len(set(groups))))[:, :3].tolist()
colors = [(31,119,180), (44, 160, 44), (214, 39, 40), (148, 103, 189), (140, 86, 75), (227, 119, 194), (127, 127, 127), (188, 189, 34), (255, 127, 14)]
colors = [[r/255.0, g/255.0, b/255.0] for r, g, b in colors]
custom_cm = LinearSegmentedColormap.from_list("my_map", colors, N=len(colors))
colors = rainbow(np.linspace(0, 1, len(set(ctg_groups))))[:, :3].tolist()
ctg_cm = LinearSegmentedColormap.from_list("my_map", colors, N=len(colors))
colors = rainbow(np.linspace(0, 1, len(set(class_groups))))[:, :3].tolist()
class_cm = LinearSegmentedColormap.from_list("my_map", colors, N=len(colors))
bin_cmap = ListedColormap([set1[8], "#5400F6"], name="bin_cmap")
numeric_cmap = "plasma" # plasma

print("Plotting with Faerun")
# slow
f = Faerun(clear_color="#ffffff", coords=False, view="front",)
    
f.add_scatter(
    "ReactionAtlas",
    {
        "x": x, "y": y, 
        "c": [
            groups, # superclasses
            ctg_groups,
            class_groups,
            l2norm,
            has_Pd, 
            has_Li, 
            has_Mg, 
            has_Al,
            tpsa_ranked,
            logp_ranked,
            mw_ranked,
            h_acceptors_ranked,
            h_donors_ranked,
            ring_count_ranked,
        ], 
        "labels": labels
    },
    shader="smoothCircle",
    colormap=[
        custom_cm, 
        ctg_cm,
        class_cm,
        numeric_cmap,
        bin_cmap, 
        bin_cmap, 
        bin_cmap, 
        bin_cmap, 
        numeric_cmap,
        numeric_cmap,
        numeric_cmap,
        numeric_cmap,
        numeric_cmap,
        numeric_cmap,

    ],
    point_scale=2.0,
    categorical=[
        True,
        True,
        True,
        False, 
        True, 
        True, 
        True, 
        True, 
        False, 
        False, 
        False, 
        False, 
        False, 
        False, 
    ],
    has_legend=True,
    legend_labels=[
        labels_groups,
        ctg_labels,
        class_labels,
        None,
        [(0, "No"), (1, "Yes")],
        [(0, "No"), (1, "Yes")],
        [(0, "No"), (1, "Yes")],
        [(0, "No"), (1, "Yes")],
        None,
        None,
        None,
        None,
        None,
        None,
    ],
    selected_labels=["SMILES", "SMILES", "L2norm",  "Named Reaction", "Category", "Superclass"],
    series_title=[
        "Superclass", 
        "Category",
        "Class",
        "L2norm",
        "Pd", 
        "Li", 
        "Mg", 
        "Al",
        "TPSA",
        "logP",
        "Mol Weight",
        "H Acceptors",
        "H Donors",
        "Ring Count",
    ],
    max_legend_label=[
        None,
        None,
        None,
        str(round(max(l2norm))),
        None,
        None,
        None,
        None,
        str(round(max(tpsa))),
        str(round(max(logp))),
        str(round(max(mw))),
        str(round(max(h_acceptors))),
        str(round(max(h_donors))),
        str(round(max(ring_count))),
    ],
    min_legend_label=[
        None,
        None,
        None,
        str(round(min(l2norm))),
        None,
        None,
        None,
        None,
        str(round(min(tpsa))),
        str(round(min(logp))),
        str(round(min(mw))),
        str(round(min(h_acceptors))),
        str(round(min(h_donors))),
        str(round(min(ring_count))),
    ],
    title_index=2,
    legend_title="",
)

f.add_tree("reactiontree", {"from": s, "to": t}, point_helper="ReactionAtlas")

plot = f.plot(output_file, template="reaction_smiles")

print("Replacing broken smiles drawer script")
# Replace broken smiles script
file_path = f"{output_file}.html"

old = '<script src="https://unpkg.com/smiles-drawer@2.1.7/dist/smiles-drawer.min.js"></script>'
# with open('./tmap/smilesDrawer_override.txt', "r", encoding="utf-8") as f:
#     new = f.read()
with open(file_path, "r", encoding="utf-8") as f:
    html = f.read()
new = '<script src="https://unpkg.com/smiles-drawer@2.0.1/dist/smiles-drawer.min.js"></script>'
html = html.replace(old, new)

# Write updated HTML
with open(file_path, "w", encoding="utf-8") as f:
    f.write(html)

# Add mapping of node indexes to all edge indexes in 2d array [[edge indexes of node 1],[for node 2]...]
incident_edges = [[] for i in range(2*len(s))]
index = 0
for i in tqdm(range(len(s)), desc="Mapping nodes to edges", leave=False):
    coord = s[i]
    incident_edges[coord].append(index)
    index += 1

    coord = t[i]
    incident_edges[coord].append(index)
    index += 1

pbar.set_description("")
pbar.update()
# Also add neighbor indexes in 2d array [[node 1 neighbors], ...]
neighbors = [[] for i in range(len(x))]
for i in tqdm(range(len(s)), desc="Constructing edge list", leave=False):
    neighbors[s[i]].append(t[i])
    neighbors[t[i]].append(s[i])

pbar.set_description("Writing to file")
pbar.update()

file_path = f"{output_file}.js"
with open(file_path, "r+b") as f:
    content = f.read()

    # remove only the last occurrence of "};"
    idx = content.rfind(b"};")
    if idx == -1:
        raise ValueError("Could not find closing '};'")    
    f.seek(idx)

    incident_edges = json.dumps(incident_edges, separators=(",",":")).encode()
    neighbors = json.dumps(neighbors, separators=(",",":")).encode()

    new_end = (
        b"incident_edges:" + incident_edges + b",\n"
        b"neighbors:" + neighbors + b"\n};")
    f.write(new_end)
    f.truncate()
    

pbar.update()
print("DONE")