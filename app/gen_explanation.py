import json
import pandas
from openai import OpenAI
import re
from dotenv import load_dotenv
import os

load_dotenv("../.env")

schneider_df = pandas.read_csv("./data/schneiderCanon_w_descs.csv")

with open('./data/rxnclass2name.json', 'r') as f:
    rxnclass2name = json.load(f)

schneider_df["Rxn_Names"] = schneider_df["Rxn_Class"].map(rxnclass2name)

del rxnclass2name

def get_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None, json.loads("""
            {"keywords": ["NA"],
            "summary": "No API KEY\"}""")
    return OpenAI(), None

def summarize_neighborhood(vertices, instructions, model, include_labels):
    client, failed = get_client()
    if client is None:
        return failed

    # Make prompt
    prompt = ""
    col = schneider_df["Rxn"]
    classname_col = schneider_df["Rxn_Names"]
    for i in range(len(vertices)):
        curI = int(vertices[i])
        if (include_labels):
            prompt += f"{classname_col[curI]}: "
        prompt += f"{col[curI]}\n\n"
    # Query
    response = client.responses.create(
        model=model,
        instructions=instructions,
        input=f"```\n{prompt}```",
        # temperature=0.3
    )
    raw_text = response.output_text
    # 1. Remove Markdown ```json ``` wrappers if present
    json_text = re.sub(r"\`\`\`json|\`\`\`", "", raw_text).strip()

    # 2. Remove trailing commas before } or ]
    json_text = re.sub(r",\s*([}\]])", r"\1", json_text)
    return json.loads(json_text)

def compare_neighborhoods(vertices, instructions, model, include_labels):
    client, failed = get_client()
    if client is None:
        return failed
    # Make prompt
    prompt = ""
    col = schneider_df["Rxn"]
    classname_col = schneider_df["Rxn_Names"]
    for i in range(len(vertices)):
        cur_vtx = vertices[i]
        if (i == 0):
            if len(cur_vtx) <= 0:
                continue
            prompt += "Overlap: ["
        else:
            prompt += f"Neighborhood {i}: ["
        for j in range(len(cur_vtx)):
            curI = int(cur_vtx[j])
            if (include_labels):
                prompt += f"{classname_col[curI]}: "
            prompt += f"{col[curI]}\n\n"
        prompt += "]\n"
    # Query
    response = client.responses.create(
        model=model,
        instructions=instructions,
        input=f"```\n{prompt}```",
        # temperature=0.3
    )
    raw_text = response.output_text
    # 1. Remove Markdown ```json ``` wrappers if present
    json_text = re.sub(r"\`\`\`json|\`\`\`", "", raw_text).strip()

    # 2. Remove trailing commas before } or ]
    json_text = re.sub(r",\s*([}\]])", r"\1", json_text)
    return json.loads(json_text)

def explain_paths(vertices, instructions, model, include_labels):
    client, failed = get_client()
    if client is None:
        return failed

    # Make prompt
    prompt = ""
    col = schneider_df["Rxn"]
    classname_col = schneider_df["Rxn_Names"]
    if len(vertices) == 1:
        vertices = vertices[0]
        for i in range(len(vertices)):
            curI = int(vertices[i])
            if (include_labels):
                prompt += f"{classname_col[curI]}: "
            prompt += f"{col[curI]}\n\n"
    else: # 2 paths
        for i in range(len(vertices)):
            cur_vtx = vertices[i]
            prompt += f"Path {i+1}: ["
            for j in range(len(cur_vtx)):
                curI = int(cur_vtx[j])
                if (include_labels):
                    prompt += f"{classname_col[curI]}: "
                prompt += f"{col[curI]}\n\n"
            prompt += "]\n"
    # Query
    response = client.responses.create(
        model=model,
        instructions=instructions,
        input=f"```\n{prompt}```",
        # temperature=0.3
    )
    raw_text = response.output_text
    # 1. Remove Markdown ```json ``` wrappers if present
    json_text = re.sub(r"\`\`\`json|\`\`\`", "", raw_text).strip()

    # 2. Remove trailing commas before } or ]
    json_text = re.sub(r",\s*([}\]])", r"\1", json_text)
    return json.loads(json_text)