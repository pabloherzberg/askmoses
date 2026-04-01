
# CODEOWNERS — Documentação (Informativo)

> **Nota:** Este arquivo é apenas documentação. As regras de ownership efetivamente aplicadas pelo GitHub estão em [`.github/CODEOWNERS`](./CODEOWNERS).

Este arquivo documenta as regras de code ownership e proteção da branch `main`.

## Proteção de Branch

A branch `main` está protegida. Apenas `@pabloherzberg` e `@lucaasramon` podem realizar merge direto.

### Regra

```
* @pabloherzberg @lucaasramon
```

**O que isso significa:**
- ✅ Apenas `@pabloherzberg` e `@lucaasramon` podem aprovar PRs para `main`
- ❌ Nenhum outro usuário pode fazer push direto para `main`
- ❌ Nenhum outro usuário pode fazer merge sem aprovação explícita do owner

### GitHub Branch Protection Settings

Para garantir a proteção, ativar em **Settings → Branches → Branch protection rules**:
- ✅ Require pull request reviews before merging
- ✅ Require approval from code owners
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Restrict who can push to matching branches (`@pabloherzberg` e `@lucaasramon` apenas)
