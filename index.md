# ethduke

> Exploring applied AI and crypto through model training, evaluation, research pipelines, and agent tooling.

Website: https://ethduke.github.io/

## Profiles

- [GitHub](https://github.com/ethduke)
- [Hugging Face](https://huggingface.co/ethduke)

## Projects

### MemeSieve

A small memecoin algo-trading bot on Robinhood Chain. Uses my LoRA risk model, trained on Robinhood rug examples, for token evaluation, with Grok/X Search research paid per request through x402.

Tech: Python, Web3.py, Polars, SQLite, HTML/CSS/JavaScript; x402 v2 with USDG/EIP-3009 payments.

[Live site](https://memesieve.xyz/).

### Solana Bytecode Classifier

Qwen3-8B LoRA classification with calibrated probabilities and structured holdouts.

Category: Training & evaluation.

[Project summary](https://ethduke.github.io/#solana-bytecode-classifier).

#### Program Lens

Review workspace for this classifier: compare predictions and evidence, investigate disagreements, and export review notes. The live demo uses synthetic cases.

[Live demo](https://ethduke.github.io/program-lens/).

### Contract Risk Classifier

Fine-tuning and evaluating Qwen3.5 with LoRA to answer risk questions about decompiled EVM token contracts.

Category: Applied ML.

[Model card](https://huggingface.co/ethduke/robinhood-contract-traps-qwen3.5-0.8b-lora).

### On-chain Research Pipeline

Uniswap event decoding, Parquet datasets, and liquidity and wallet-flow research with Python and Polars.

Category: Data & research.

[Project summary](https://ethduke.github.io/#on-chain-research-pipeline). No public repository or demo is linked.

### Farmgun

A crypto launch application with agent APIs, paid image generation, and recovery of interrupted workflows.

Category: Agent tooling.

[Project summary](https://ethduke.github.io/#farmgun). No public repository or demo is linked.

## Additional project notes

### Hoodra Inference Marketplace MVP

OpenAI-compatible FastAPI inference marketplace prototype with USDG/EIP-3009 settlement, an HTTP 402 payment challenge/retry flow, usage accounting, seller revenue, platform fees, and buyer credits after upstream failure. Buyer credits are internal credits, not automatic on-chain refunds.

No public repository or demo is linked.

### RAG Retrieval Prototype

Python retrieval prototype using PostgreSQL/pgvector, embedding retrieval, and a full-text fallback. Integrates OpenRouter embeddings and chat generation with retrieved context and prompts requesting citations and an explicit insufficient-evidence response.

No public repository or demo is linked.

## Code & experiments

- [Gensyn peer analytics](https://github.com/ethduke/gensyn_rlswarm_leaderboard)
- [EIP-7702 experiments](https://github.com/ethduke/eip_7702_batch_txs)
- [LLM workflow example](https://github.com/ethduke/tg_summary_openrouter)
- [Trading research example](https://github.com/ethduke/dex_funding_rate_arbitrage)

## Site source

- [Website repository](https://github.com/ethduke/ethduke.github.io)

This page contains public project summaries under the handle ethduke. It does not publish a full CV or establish employment dates, qualifications, deployment scale, or adoption beyond the descriptions above.
