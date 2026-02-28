# Architecture du Système de Plugins

## Vue d'ensemble

Le système de plugins du portail LemonLDAP::NG JavaScript est conçu pour répliquer le comportement de l'implémentation Perl de référence (`Lemonldap::NG::Portal::Main::Plugins`), tout en utilisant les idiomes TypeScript/JavaScript modernes.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Portal                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ AuthModule  │  │ UserDBModule│  │     PluginManager       │  │
│  └─────────────┘  └─────────────┘  │  ┌─────┐ ┌─────┐ ┌────┐ │  │
│                                     │  │CDA  │ │Notif│ │... │ │  │
│                                     │  └─────┘ └─────┘ └────┘ │  │
│                                     └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Composants Principaux

### 1. PluginManager (`src/plugins/manager.ts`)

Le `PluginManager` est le composant central qui gère le cycle de vie des plugins :

```typescript
class PluginManager {
  private plugins: Map<string, Plugin>;
  private hookRegistry: Map<HookName, Plugin[]>;

  async init(portal: Portal): Promise<void>;
  async executeHook(hookName: HookName, req: PortalRequest): Promise<PluginResult>;
  registerRoutes(router: Router): void;
  async close(): Promise<void>;
}
```

**Responsabilités :**
- Découverte des plugins activés selon la configuration
- Chargement dynamique des packages npm
- Enregistrement et exécution des hooks
- Enregistrement des routes Express
- Nettoyage des ressources

### 2. Plugin Registry (`src/plugins/registry.ts`)

Le registre statique des plugins, équivalent à `@pList` en Perl :

```typescript
const pluginRegistry: PluginRegistration[] = [
  { configKeys: "cda", packageName: "@lemonldap-ng/plugin-cda" },
  { configKeys: "notification", packageName: "@lemonldap-ng/plugin-notifications" },
  // ... 41 plugins configurés
];
```

**Structure d'une entrée :**

| Champ | Description |
|-------|-------------|
| `configKeys` | Clé(s) de configuration qui active(nt) le plugin |
| `packageName` | Nom du package npm |
| `compoundCondition` | Condition composée (OR/AND) sur plusieurs clés |
| `wildcardPath` | Chemin avec wildcard (ex: `path/*/key`) |
| `priority` | Ordre de chargement (plus élevé = plus tard) |

### 3. Config Checker (`src/plugins/config-checker.ts`)

Utilitaire pour vérifier les conditions d'activation dans la configuration :

```typescript
// Chemin simple
checkConf(conf, "cda") // true si conf.cda est truthy

// Chemin imbriqué
checkConf(conf, "auth/methods/openid")

// Chemin avec wildcard (vérifie tous les RP OIDC)
checkConf(conf, "oidcRPMetaDataOptions/*/oidcRPMetaDataOptionsAllowNativeSso", "or")
```

### 4. Interface Plugin (`src/plugins/types.ts`)

```typescript
interface Plugin {
  readonly name: string;
  init(context: PluginContext): Promise<boolean>;

  // Hooks du cycle de vie (optionnels)
  beforeAuth?(req: PortalRequest): Promise<PluginResult>;
  betweenAuthAndData?(req: PortalRequest): Promise<PluginResult>;
  afterData?(req: PortalRequest): Promise<PluginResult>;
  endAuth?(req: PortalRequest): Promise<PluginResult>;
  beforeLogout?(req: PortalRequest): Promise<PluginResult>;
  forAuthUser?(req: PortalRequest): Promise<PluginResult>;

  // Enregistrement de routes (optionnel)
  registerRoutes?(router: Router): void;
  registerAuthRoutes?(router: Router): void;
  registerUnauthRoutes?(router: Router): void;

  close?(): Promise<void>;
}
```

## Flux d'Exécution

### Initialisation

```
Portal.initialize()
    │
    ├── Charger AuthModule
    ├── Charger UserDBModule
    ├── Charger TwoFactorManager
    │
    └── PluginManager.init(portal)
            │
            ├── Parcourir pluginRegistry
            │       │
            │       ├── shouldEnablePlugin(conf, registration)
            │       │       │
            │       │       ├── Vérifier wildcardPath
            │       │       ├── Vérifier compoundCondition
            │       │       └── Vérifier configKeys
            │       │
            │       └── Si activé: loadPlugin(registration)
            │               │
            │               ├── import(packageName)
            │               ├── new PluginClass()
            │               ├── plugin.init(context)
            │               └── registerHooks(plugin)
            │
            └── Charger customPlugins depuis conf
```

### Exécution des Hooks

```
POST /  (Login)
    │
    ├── sessionMiddleware
    ├── authMiddleware
    ├── userDBMiddleware
    │
    └── Route Handler
            │
            ├── pluginManager.executeHook("beforeAuth", req)
            │       │
            │       └── Pour chaque plugin avec beforeAuth:
            │               │
            │               ├── plugin.beforeAuth(req)
            │               └── Si code !== PE_OK ou stop: arrêter
            │
            ├── Vérifier authResult
            ├── Créer session
            │
            └── pluginManager.executeHook("endAuth", req)
                    │
                    └── Pour chaque plugin avec endAuth:
                            │
                            └── plugin.endAuth(req)
```

### Points d'Insertion des Hooks

| Hook | Moment | Cas d'usage |
|------|--------|-------------|
| `beforeAuth` | Avant vérification des credentials | Brute force protection, CAPTCHA |
| `betweenAuthAndData` | Après auth, avant userDB | Validation additionnelle |
| `afterData` | Après récupération données utilisateur | Modification des attributs |
| `endAuth` | Session créée, avant redirection | CDA, notifications |
| `beforeLogout` | Avant suppression session | Global logout, audit |
| `forAuthUser` | Utilisateur déjà authentifié | CDA, menu externe |

## Structure des Packages

### Convention de Nommage

```
@lemonldap-ng/plugin-{name}
```

Exemples :
- `@lemonldap-ng/plugin-cda`
- `@lemonldap-ng/plugin-notifications`
- `@lemonldap-ng/plugin-brute-force`

### Structure d'un Package Plugin

```
packages/plugin-{name}/
├── package.json
├── tsconfig.json
├── rollup.config.mjs
└── src/
    ├── index.ts        # Export du plugin (default export)
    └── index.test.ts   # Tests unitaires
```

### Package Commun

Le package `@lemonldap-ng/plugin-common` fournit :

```typescript
// Classe de base abstraite
abstract class BasePlugin {
  abstract readonly name: string;
  protected conf: LLNG_Conf;
  protected logger: LLNG_Logger;
  protected portal: Portal;

  async init(context: PluginContext): Promise<boolean>;
  protected async onInit(): Promise<boolean>;

  // Helpers
  protected debug(message: string): void;
  protected info(message: string): void;
  protected warn(message: string): void;
  protected error(message: string): void;
  protected getConf<T>(key: string, defaultValue?: T): T;
}
```

## Codes de Retour (PE_*)

```typescript
const PE_OK = 0;                  // Continuer
const PE_SESSIONEXPIRED = 1;      // Session expirée
const PE_FORMEMPTY = 2;           // Formulaire vide
const PE_USERNOTFOUND = 4;        // Utilisateur non trouvé
const PE_BADCREDENTIALS = 5;      // Mauvais credentials
const PE_ERROR = 24;              // Erreur générique
// ... etc.
```

Un hook retourne `PluginResult` :

```typescript
interface PluginResult {
  code: number;      // PE_OK pour continuer
  error?: string;    // Message d'erreur
  stop?: boolean;    // Arrêter le traitement des plugins suivants
}
```

## Exemple : Plugin CDA

```typescript
class CDAPlugin extends BasePlugin {
  readonly name = "CDA";

  protected async onInit(): Promise<boolean> {
    this.cookieName = this.getConf("cookieName", "lemonldap");
    this.info("CDA plugin initialized");
    return true;
  }

  async endAuth(req: CDARequest): Promise<PluginResult> {
    // Vérifier si URL externe
    if (!this.urlIsExternal(portal, urldc)) {
      return ok();
    }

    // Créer session CDA temporaire
    const cdaSession = await this.createCDASession(req);

    // Modifier URL de redirection
    req.llngUrldc = `${urldc}?${this.cookieName}cda=${cdaSession.id}`;

    return ok();
  }

  async forAuthUser(req: CDARequest): Promise<PluginResult> {
    return this.endAuth(req);
  }
}

export default CDAPlugin;
```

## Correspondance Perl ↔ JavaScript

| Perl | JavaScript |
|------|------------|
| `@pList` | `pluginRegistry[]` |
| `checkConf()` | `checkConf()` |
| `enabledPlugins()` | `PluginManager.init()` |
| `use constant endAuth => 'method'` | `endAuth?(req): Promise<PluginResult>` |
| `Lemonldap::NG::Portal::Plugins::*` | `@lemonldap-ng/plugin-*` |
| `extends 'Lemonldap::NG::Common::Module'` | `extends BasePlugin` |

## Configuration

### Activation Simple

```yaml
# lemonldap-ng.yaml
cda: true
notification: true
bruteForceProtection: true
```

### Plugins Personnalisés

```yaml
customPlugins: "@my-org/plugin-custom, @my-org/plugin-audit"
```

### Condition Composée (SingleSession)

Le plugin SingleSession s'active si une des clés suivantes est vraie :
- `singleSession`
- `singleIP`
- `singleUserByIP`
- `notifyOther`

### Condition Wildcard (OIDC Native SSO)

Le plugin OIDC Native SSO s'active si au moins un RP OIDC a `oidcRPMetaDataOptionsAllowNativeSso` activé :

```yaml
oidcRPMetaDataOptions:
  myApp:
    oidcRPMetaDataOptionsAllowNativeSso: true
```

## Tests

```bash
# Tests unitaires du système de plugins
npx vitest run packages/portal/src/plugins

# Tests des packages plugins
npx vitest run packages/plugin-common packages/plugin-cda
```

## Bonnes Pratiques

1. **Toujours retourner `ok()`** si le plugin n'a rien à faire
2. **Logger les actions importantes** via les helpers `debug()`, `info()`, etc.
3. **Gérer les erreurs gracieusement** - ne pas faire échouer l'authentification pour une erreur de plugin non critique
4. **Utiliser `BasePlugin`** pour bénéficier des helpers et de la structure standard
5. **Tester les hooks** avec des mocks du Portal et du Logger
