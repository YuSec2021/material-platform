## Sprint 5: AI Material Addition and Vector Matching

### Features
- F08-AI natural language material addition (capability: `material_add`)
- F08-Frontend: multi-step AI add material wizard
- F09-AI vector similarity matching (capability: `material_match`)
- Qdrant vector DB integration with hybrid search, with deterministic local fallback allowed only when Qdrant is unavailable in the test environment
- Frontend: duplicate detection UI with Top-3 matches and confidence scores
- AI-powered attribute extraction from unstructured material input before material creation
- LLM provider integration for AI governance responses, including visible provider/capability metadata and configurable provider selection

### AI Material Addition Fields
An AI material addition request contains:
- `input_text` (string, required, unstructured material description)
- `material_library_id` (integer, required)
- optional `category_id`, `product_name_id`, `brand_id`, and `unit` hints
- optional image or attachment metadata when supplied by the browser

An AI material addition preview returns:
- `capability` (string, value `material_add`)
- `provider` (string, active LLM provider name, e.g. `mock`, `dashscope`, `azure`, `vllm`, or `ollama`)
- `model` (string, active model identifier)
- `trace_id` (string, stable non-empty identifier for the AI governance request)
- proposed material fields: name, unit, category/product-name binding, brand, description, and attributes
- extraction confidence and field-level extraction sources
- vector duplicate check summary with Top-3 matches, match scores, and threshold classification

### Success criteria (black-box-verifiable)
- [ ] A user can run an AI material addition wizard from unstructured input, review extracted fields, approve the preview, and create a material with an auto-generated code.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Navigate to the AI material addition area from the visible navigation or open `http://localhost:5173/materials/ai-add`.
  3. Enter a unique unstructured description such as `申请新增 华为 24口千兆交换机 S1730S-L24T-A1，单位台，品牌华为，端口数24，速率1000Mbps，适用于办公网络接入`, select a material library, and run AI analysis.
  4. Assert the preview page shows extracted material name, unit, brand, product/category recommendation, and at least two attribute values derived from the unstructured input.
  5. Assert the preview includes visible AI governance metadata: `material_add` capability, provider name, model name, trace ID, and confidence.
  6. Approve or confirm the preview from the browser UI and assert a success message reports that a material was created.
  7. Search the material list at `http://localhost:5173/materials` for the unique material name and assert the created material appears with an auto-generated material code in `MAT-XXXXXXXX` format and `normal` status.

- [ ] AI attribute extraction is available through documented HTTP surfaces and returns structured, validated field suggestions from plain text.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` in a browser.
  2. Assert the OpenAPI document lists an AI material addition preview endpoint, for example `/api/v1/materials/ai-add/preview` or `/api/v1/ai/material-add/preview`, and that the operation exposes the `material_add` capability.
  3. Send a real HTTP request to the preview endpoint with an unstructured description containing a material name, unit, brand, and at least two attribute facts.
  4. Assert the JSON response contains `capability: "material_add"`, non-empty provider/model metadata, a non-empty `trace_id`, proposed material fields, and an `attributes` object containing extracted values from the request text.
  5. Assert the response identifies missing or ambiguous required fields with visible validation errors instead of creating a material automatically.
  6. Send a valid HTTP confirmation request for the preview result and assert the response returns a persisted material with an auto-generated `MAT-XXXXXXXX` code.

- [ ] Semantic search and vector matching detect likely duplicate materials and classify matches by score thresholds.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Create or confirm the existence of at least three baseline materials in the same material library, including one with substantially similar text, brand, and attributes to the material that will be added through AI.
  3. Open `http://localhost:5173/materials/ai-add`, enter an unstructured description that is semantically similar to the baseline material but not an exact text copy, and run AI analysis.
  4. Assert the duplicate detection section displays the Top-3 candidate matches with material code, name, brand or attributes, numeric confidence scores, and a visible classification of highly duplicate, suspicious, or normal.
  5. Assert a highly similar material is classified as highly duplicate when the score is at least `0.90`, a moderately similar material is classified as suspicious when the score is at least `0.75` and below `0.90`, and a low-similarity material is classified as normal when below `0.75`.
  6. Assert the UI allows the user to reject/cancel creation because of a duplicate warning and that the rejected preview does not create a new material in the material list.
  7. Repeat with a clearly distinct material description, approve creation, and assert the vector matching result is normal and the material is created successfully.

- [ ] Vector matching is exposed through a documented API used by the browser and returns hybrid matching evidence, not only exact keyword matches.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` in a browser.
  2. Assert the OpenAPI document lists a material matching endpoint, for example `/api/v1/materials/match` or `/api/v1/ai/material-match`, and that the operation exposes the `material_match` capability.
  3. Use the browser or a real HTTP request to create two materials with different wording but semantically close meaning in the same material library.
  4. Send a real HTTP request to the matching endpoint with a query description that uses synonyms or reordered attributes rather than the exact stored material name.
  5. Assert the response returns up to three matches with `capability: "material_match"`, total score, semantic score, text score, brand score, and threshold classification for each match.
  6. Assert the semantically closest existing material appears ahead of an unrelated material, proving the result is not limited to exact substring search.
  7. Open `http://localhost:5173/materials/ai-add` and assert the browser UI displays the same matching evidence during the AI add flow.

- [ ] LLM provider governance can be configured externally and is reflected in AI material addition and matching results without a server restart.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open the AI governance or model provider configuration area from navigation, or open `http://localhost:5173/ai/providers`.
  3. Add or select a test-safe provider configuration using a local/mock provider with no real secret required, map `material_add` and `material_match` to that provider, and save the configuration.
  4. Run a connection test from the browser UI and assert the UI reports success with the selected provider and model.
  5. Without restarting `bash init.sh` or the backend server, run an AI material addition preview from `http://localhost:5173/materials/ai-add`.
  6. Assert the preview response shown in the UI uses the newly selected provider/model metadata for `material_add`.
  7. Run vector matching during the same flow and assert the matching result also includes visible provider or embedding provider metadata for `material_match`.

---

CONTRACT APPROVED
