# Research portfolio

Website: https://ethduke.github.io/

[GitHub](https://github.com/ethduke) · [Hugging Face](https://huggingface.co/ethduke)

## Selected work

### Solana Bytecode Classifier

A pipeline for classifying deployed Solana programs, combining data preparation, model fine-tuning and holdout evaluation, with a workspace for inspecting classification errors.

[Program Lens demo](https://ethduke.github.io/program-lens/) (synthetic cases).

Tools: Qwen3-8B, LoRA, Claude Sonnet, React, TypeScript.

### Contract Risk Classifier

A language model fine-tuned to analyze risk-related behavior in EVM contracts.

[View published model](https://huggingface.co/ethduke/robinhood-contract-traps-qwen3.5-0.8b-lora).

Tools: Python, PyTorch, Hugging Face Transformers, PEFT / LoRA, Qwen3.5-0.8B.

### On-chain Research Pipeline

Python tooling for liquidity and wallet-flow research, with historical trading-rule experiments.

Tools: Python, Polars, NumPy, Parquet, xAI Responses API.

### MemeSieve

A memecoin trading bot on Robinhood Chain with on-chain monitoring, model-assisted token evaluation and Grok research.

[View project](https://memesieve.xyz/).

Tools: Python, Web3.py, Polars, SQLite, xAI Responses API.

### Farmgun

A crypto launch application with authenticated agent APIs, paid image generation and recovery of interrupted workflows.

Tools: TypeScript, Node.js, Grok image generation, HTTP 402, USDG.

## Experiments

- [Gensyn RL Swarm peer analytics](https://github.com/ethduke/gensyn_rlswarm_leaderboard)
- [EIP-7702 batch transaction experiments](https://github.com/ethduke/eip_7702_batch_txs)
- [LLM workflow example with OpenRouter](https://github.com/ethduke/tg_summary_openrouter)

## About

I started with GPU programming at university, implementing an iterative algorithm for global optical flow in CUDA. I then moved into mobile app and game development for iOS and Android.

Later, my focus shifted to crypto: investing my own capital and building tools for on-chain research, portfolio monitoring, trading and arbitrage experiments.

More recently, I’ve returned to my earlier interest in AI, working on model fine-tuning, evaluation and ML tools.

## Additional project notes

### Hoodra Inference Marketplace MVP

OpenAI-compatible FastAPI inference marketplace prototype with USDG/EIP-3009 settlement, an HTTP 402 payment challenge/retry flow, usage accounting, seller revenue, platform fees, and buyer credits after upstream failure. Buyer credits are internal credits, not automatic on-chain refunds.

No public repository or demo is linked.

### RAG Retrieval Prototype

Python retrieval prototype using PostgreSQL/pgvector, embedding retrieval, and a full-text fallback. Integrates OpenRouter embeddings and chat generation with retrieved context and prompts requesting citations and an explicit insufficient-evidence response.

No public repository or demo is linked.

[Site source](https://github.com/ethduke/ethduke.github.io).
