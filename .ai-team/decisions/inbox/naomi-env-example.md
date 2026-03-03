# Decision: `.env.example` File Creation

**Date:** 2025 (current session)  
**Owner:** Naomi (Backend Dev)  
**Status:** Complete

## Summary

Created `.env.example` file at the project root documenting all environment variables used by the smart-a11y-scanner.

## What Was Done

Scanned the entire codebase for `process.env` references and compiled a comprehensive list of all environment variables:

1. **ADO_PAT** (required for ADO integration)
   - Azure DevOps Personal Access Token
   - Used in: `src/cli.ts`, `src/config/loader.ts`
   - Required for bug filing and test plan API access

2. **A11Y_SCANNER_CREDENTIALS** (optional)
   - Scanner authentication in `user:pass` format
   - Used in: `src/cli.ts`, `src/scanner/engine.ts`
   - Falls back to `--credentials` CLI option

3. **OPENAI_API_KEY** (optional)
   - OpenAI API key for LLM-based edge case generation
   - Referenced in: CLI help text and decisions.md
   - Required only when using `--ai-generate` flag

4. **AZURE_OPENAI_ENDPOINT** (optional)
   - Azure OpenAI service endpoint
   - Alternative to standard OpenAI
   - Referenced in: CLI help text and decisions.md

5. **AZURE_OPENAI_API_KEY** (optional)
   - API key for Azure OpenAI service
   - Used alongside `AZURE_OPENAI_ENDPOINT`
   - Referenced in: CLI help text and decisions.md

## File Location

`.env.example` at project root

## Format Chosen

- Simple `KEY=` format (no quotes) for easy copy-paste
- Comments above each variable explaining purpose and requirement level
- Grouped logically: ADO, Auth, AI

## Rationale

- **Required vs Optional:** Clearly marked based on codebase usage patterns
- **User:pass format:** Documented the expected format for credentials
- **Comment clarity:** Each comment explains what the variable does and when it's needed
- **Comprehensive:** Covered not just explicitly used vars but also referenced in CLI help (OpenAI keys)
