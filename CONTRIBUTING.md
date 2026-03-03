# Contributing to smart-a11y-scanner

Thank you for your interest in contributing! We welcome contributions from everyone. This guide will help you get started.

## Setting Up the Dev Environment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/GalGoldi72/smart-a11y-scanner.git
   cd smart-a11y-scanner
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## Running Tests

Run the test suite with:
```bash
npm test
```

For watch mode (tests re-run on file changes):
```bash
npm run test:watch
```

## Running the Scanner Locally

After building, you can run the scanner using:
```bash
npm start
```

Or directly with ts-node during development:
```bash
npm run dev
```

The scanner provides two command-line interfaces: `a11y-scan` and `smart-a11y-scanner`.

## Code Style Guidelines

- **Language:** TypeScript
- **Compiler Settings:** See `tsconfig.json` for strict TypeScript configuration
  - Target: ES2022
  - Strict mode enabled
  - Declaration files generated
  - Source maps included
- **Linting:** Run `npm run lint` to check code style with ESLint
- **Format:** Use consistent casing and follow the existing code patterns in the `src/` directory
- **Tests:** Place test files alongside source files with `.test.ts` extension (excluded from build output)

## Submitting a Pull Request

1. **Fork the repository** on GitHub
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and commit with clear, descriptive messages:
   ```bash
   git commit -m "Add feature: description of changes"
   ```
4. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** with a clear title and description of your changes
6. Ensure all tests pass and code style checks are clean before submitting

## Bug Reporting

Found a bug? Please open an issue with:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Your environment (Node version, OS, browser if applicable)
- Any relevant error messages or screenshots

## Questions?

Feel free to open an issue with your question or join our discussions. We're here to help!
