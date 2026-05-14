# SKILL: Bioinformatics
<!-- Domains: scRNA-seq QC · Genomic Pipeline Orchestration · Variant Analysis · Pathway Analysis -->
<!-- Auto-loaded when: discussing genomic data, RNA-seq, scRNA-seq, VCF files, pipeline runs, NCBI/Ensembl IDs -->

---

## ⚠️ SCIENTIFIC INTEGRITY BLOCK (Non-negotiable)
> This block applies to ALL output from this skill. Violations invalidate the entire response.

1. **No hallucinated gene/protein identities.** Never assert that a gene symbol, Ensembl ID, UniProt accession, or NCBI Gene ID refers to a specific function without a traceable source. Tag uncertain claims: `[NEEDS VERIFICATION — check NCBI Gene / Ensembl / UniProt]`.
2. **No fabricated pathway memberships.** Do not state that gene X is "part of pathway Y" without citing the database (KEGG, Reactome, GO) and the term ID. Example: `GO:0006915 (apoptotic process)` — not just "apoptosis pathway."
3. **No invented p-values or fold changes.** Numerical results (DEG stats, cluster markers, QC thresholds) must come from the actual data or be explicitly labeled `[EXAMPLE VALUE — not from your data]`.
4. **Reference genome version matters.** Always state the genome assembly (GRCh38/hg38, GRCm39, etc.) and annotation version (Ensembl 110, GENCODE v44). Mismatches between alignment and annotation are silent errors.
5. **Batch effects are real.** Never interpret biological signal without first asking: is this batch, sample prep, or sequencing lane variation?

---

## scRNA-seq QC Protocol

### Step 1 — Per-cell QC metrics (compute before any filtering):
| Metric | Typical range (human PBMC) | Flag if |
|--------|---------------------------|---------|
| `nCount_RNA` (total UMI) | 1,000 – 50,000 | < 200 (empty) or > 3× median (doublet) |
| `nFeature_RNA` (genes detected) | 500 – 8,000 | < 200 or > 2× median |
| `percent.mt` (mitochondrial %) | < 10–20% | > 25% (dying/low-quality cells) |
| `log10GenesPerUMI` | > 0.80 | < 0.80 (low complexity) |

> These thresholds are **starting points only**. Tissue type and protocol dramatically shift what is "normal." Always plot distributions and justify thresholds in the methods.

### Step 2 — Doublet detection:
- Run DoubletFinder or Scrublet **before** clustering.
- Report doublet rate per sample. Expected: ~0.8% per 1,000 cells loaded (10x Genomics rule).
- Do NOT filter doublets silently — log the count and the threshold used.

### Step 3 — Ambient RNA correction:
- Use SoupX or CellBender on raw count matrices.
- Estimate contamination fraction per sample; report it.
- If contamination > 20%, flag the sample as high-risk and re-examine wet-lab protocol.

### Step 4 — Normalization:
- Standard: `scran` pooling-based normalization OR `SCTransform` (Seurat v3+).
- Do NOT use simple library-size normalization (CPM/TPM) for DE analysis with scRNA-seq.
- Log1p-transform after normalization for visualization and HVG selection.

### Step 5 — Highly Variable Gene (HVG) selection:
- Typical: top 2,000–5,000 HVGs.
- Exclude mitochondrial, ribosomal (`RPS`/`RPL`), and cell-cycle genes unless studying those specifically.
- Document the selection method and cutoffs.

---

## Genomic Pipeline Orchestration

### Pipeline metadata requirements (every run):
```yaml
pipeline_run:
  id: <uuid>
  date: <ISO-8601>
  genome_assembly: <e.g. GRCh38>
  annotation_version: <e.g. Ensembl 110>
  tool_versions:
    - <tool>: <version>
  input_files:
    - <md5sum>: <filename>
  parameters: <full config snapshot>
  output_location: <path or URI>
  operator: <username>
```

### Reproducibility checklist:
- [ ] All tool versions pinned (Docker image SHA or conda env YAML exported).
- [ ] Random seeds set and logged for stochastic steps (UMAP, clustering).
- [ ] Intermediate files checksummed.
- [ ] Full parameter config saved alongside output.
- [ ] Re-run from scratch produces bit-identical output (or document where it doesn't and why).

### Common pipeline failure modes:
| Failure | Symptom | Fix |
|---------|---------|-----|
| Reference mismatch | Low alignment rate (<60%) | Confirm genome assembly matches sample species/build |
| Annotation version drift | Missing genes in count matrix | Pin annotation version, re-generate genome index |
| Memory OOM | STAR/HISAT2 crash mid-run | Pre-check: STAR needs ~30 GB RAM for human genome |
| PCR duplicate overcount | Inflated counts, low complexity | Apply UMI deduplication (UMI-tools, STARsolo) |
| Batch confounding | PC1 = sample, not biology | Run Harmony, scVI, or BBKNN before clustering |

---

## Variant Analysis (targeted / WGS / WES)

### Variant calling checklist:
- [ ] Base quality score recalibration (BQSR) applied — GATK best practices.
- [ ] Coverage depth ≥ 30× for somatic; ≥ 10× for germline (document actual coverage).
- [ ] Population allele frequency checked (gnomAD v4 or dbSNP for common variants).
- [ ] Functional annotation applied: VEP / ANNOVAR / SnpEff — state version.
- [ ] Variants in repetitive regions flagged (LCR mask, segmental duplications).

### Variant interpretation tiers (ACMG/AMP framework):
| Tier | Label | Meaning |
|------|-------|---------|
| 1 | Pathogenic | Strong evidence of causation |
| 2 | Likely pathogenic | Moderate-strong evidence |
| 3 | Variant of uncertain significance (VUS) | Insufficient evidence |
| 4 | Likely benign | Moderate-strong evidence against causation |
| 5 | Benign | Strong evidence against causation |

> Never upgrade a VUS to pathogenic without evidence. Never assert clinical significance without a qualified clinical geneticist review.

---

## Integration with Lab Stock System (this project)

When bioinformatics reagents, kits, or consumables are tracked in this system:
- Map kit catalog number → `itemCode` in `item_definitions`.
- Map lot/batch number from the supplier → `lots.lotNumber`.
- SKT (expiry) from reagent box → `lots.expiryDate` via `parseSKTDate`.
- Record kit usage events as `distributions` with `distributedTo = 'genomics_pipeline_run_<id>'`.
- Flag depleted RNA extraction kits immediately — low-quality RNA is the #1 source of scRNA-seq failure.

---

## Output format for bioinformatics reports

```
ANALYSIS: <type, e.g. scRNA-seq QC>
DATE: <ISO date>
PIPELINE VERSION: <version or commit SHA>
GENOME: <assembly + annotation version>
SAMPLE IDs: <list>
CELLS BEFORE QC: <n>
CELLS AFTER QC: <n> (<% retained>)
DOUBLET RATE: <%>
AMBIENT RNA FRACTION: <%>
KEY PARAMETERS: <all non-default settings>
CAVEATS: <list>
NEXT STEPS: <list>
```
