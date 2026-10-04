# DeepSeekBot

The BotHarness product Bundle combines Core, Client and the independently versioned,
qualified IM Provider. Installing the product leaves accounts disconnected until
you configure and authorize them.

The source workspace remains a development preview. Maintainer-built npm artifacts
use the IM composition patch and exact qualified package versions. A local packed
artifact is not evidence that those versions have been published to npm.

If an existing Profile enables standalone `@xmanrui/dsh-im` or
`@botharness/im-provider` as another Bundle, remove that separate Bundle before
enabling the product's IM composition. The qualification helper checks the native composed Patch and refuses duplicate
Provider or product component entries before starting a receiver. Preserve
the existing Provider account configuration and credentials; removing a Bundle
does not require deleting its stored configuration. Revalidate the retained Bot
bindings and group authorization after switching Provider artifacts.

The qualified Provider is maintained from [dsh-im](https://github.com/xmanrui/dsh-im)
under its MIT license. It updates with the product, without an independent
upstream-package auto-update action.
