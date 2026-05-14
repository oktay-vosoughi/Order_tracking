# SKILL: Biomedical Engineering
<!-- Domains: Signal Processing · PCB/Hardware Analysis · Lab Equipment · Calibration · Standards -->
<!-- Auto-loaded when: discussing sensor data, hardware schematics, equipment maintenance, calibration records -->

---

## ⚠️ SCIENTIFIC INTEGRITY BLOCK (Non-negotiable)
> This block applies to ALL output from this skill. Violations invalidate the entire response.

1. **No fabricated specifications.** Never state a sensor sensitivity, noise floor, sampling rate, or component value without a cited source or explicit `[UNVERIFIED — CHECK DATASHEET]` tag.
2. **No invented standards.** If you reference ISO, IEC, FDA, CE, or CE-IVDR requirements, cite the exact clause. If you don't have the clause, say so.
3. **Uncertainty is mandatory.** Every numerical measurement result must include units, method, and uncertainty estimate (e.g., `±2% FS at 25°C`).
4. **Distinguish modeled from measured.** Simulated/calculated values must be explicitly labeled `[MODEL]`. Measured values must state instrument and calibration status.
5. **Hallucination tripwires:** Gene names, protein pathways, and molecular weights are in scope for this lab system. Never infer these from context — look them up or tag `[NEEDS VERIFICATION]`.

---

## Signal Processing

### Pre-analysis checklist:
- [ ] Confirm sampling rate meets Nyquist for the signal of interest (fs ≥ 2 × fmax).
- [ ] Identify and document noise sources (power-line 50/60 Hz, EMI, shot noise, thermal).
- [ ] Establish baseline/zero before applying filters.
- [ ] Preserve raw data — never overwrite originals with filtered output.

### Filter selection guide:
| Signal type | Recommended approach | Caution |
|-------------|---------------------|---------|
| ECG / biosignal | Bandpass 0.5–150 Hz, notch at 50/60 Hz | Phase distortion near cutoffs; use zero-phase (`filtfilt`) |
| Accelerometer (motion) | Low-pass ≤20 Hz | Aliasing if fs too low |
| Impedance spectroscopy | Log-spaced frequency sweep | DC offset must be removed first |
| Fluorescence (plate reader) | Median filter for spike removal | Do not use IIR on non-stationary baseline |

### Artifact rejection:
1. Identify artifact type first (motion, electrode pop, saturation).
2. Mark artifact spans — do NOT silently delete samples.
3. Interpolation only for gaps ≤ 0.5 s. Longer gaps → annotate as missing data.
4. Report artifact fraction in results (`% epochs excluded`).

---

## PCB / Hardware Analysis

### When reviewing a schematic or PCB layout:
1. **Power integrity first.** Verify decoupling capacitor placement (≤5 mm from power pin), ground plane continuity, and current return paths.
2. **Signal integrity.** Check for impedance mismatches on high-speed lines (>10 MHz). Note trace length matching requirements.
3. **Safety-critical paths.** Identify patient-contact circuits and verify isolation (IEC 60601-1 creepage/clearance for the applicable applied-part type: B, BF, or CF).
4. **Component derating.** Capacitors at ≤80% rated voltage; resistors at ≤70% rated power.

### Lab equipment maintenance flags (relevant to this system):
- Equipment with calibration due dates → surface in stock/lot notes using `SKT` (Son Kullanma Tarihi) analogy.
- Log deviations from expected calibration results as a `waste_record` with `reason = 'kalibrasyon_sapma'`.

---

## Standards Reference (verify clauses before citing)

| Standard | Scope | Key clause areas |
|----------|-------|-----------------|
| IEC 60601-1 | Medical electrical equipment safety | Basic safety, essential performance, creepage |
| IEC 62133 | Battery safety for portable medical | Cell protection, thermal |
| ISO 14971 | Risk management | Hazard identification, risk control |
| CE-IVDR (EU 2017/746) | In-vitro diagnostic devices | Performance evaluation, QMS |
| FDA 21 CFR Part 820 | QSR for medical devices | Design controls, DHF |

> Always tag cited clauses as `[NEEDS LEGAL/REGULATORY REVIEW]` unless you have read the exact text.

---

## Output format for biomedical analyses

Every analytical output must include:
```
ANALYSIS: <type>
DATE: <ISO date>
INSTRUMENT / METHOD: <name, model, calibration date>
RAW DATA SOURCE: <file or query path>
RESULT: <value ± uncertainty> <units>
ASSUMPTIONS: <list>
LIMITATIONS: <list>
NEXT STEPS: <verification or follow-up>
```
