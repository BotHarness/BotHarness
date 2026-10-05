# Configure API providers and Bot models

Continue from [Install DeepSeekBot](/docs/installation). These controls were checked with DSH **0.2.0-rc.1** and the public **deepseekbot** package. Configure the API provider first, then choose models for each Bot. Multiple Bots can use one provider. Screenshots show the Chinese UI; the captions identify the corresponding controls.

## 1. Configure a provider in DSH

Open **Settings → Models** at the bottom left. Edit an existing provider, or choose **Add model provider**.

- **Third-party provider**: choose a service from the built-in catalog, enter its API key, and save. A key supplied by the launch environment appears read-only and is managed in that environment.
- **Custom model API**: for compatible gateways or self-hosted services, fill in the fields below, add at least one model, and choose **Create provider**.

![DSH provider catalog and custom settings; no API key is displayed](/guides/settings/model-provider-catalog-zh.webp)

| Field                                 | Value / purpose                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Provider                              | The actual service from the built-in catalog; selects its adapter and default model catalog.                                            |
| Provider ID                           | A unique custom provider identifier starting with a lowercase letter, such as `acme-gateway`. Routes use this ID, not the display name. |
| Display name                          | Your recognizable name for the provider.                                                                                                |
| API URL                               | The service's base URL, such as the form's `https://gateway.example/v1`. Leave a built-in provider's override empty to use its default. |
| API protocol                          | Match the endpoint: OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages.                                                   |
| API key                               | The service credential. Enter it in DSH's credentials form, not a Bot persona or chat message.                                          |
| Fetch available models                | Retrieve the service's model catalog, if its API and your credentials support this. Otherwise add the documented model ID manually.     |
| Model ID                              | The exact identifier sent to the service.                                                                                               |
| Model display name                    | The readable name in the selector; does not change the ID.                                                                              |
| Model options → Context window        | The model's supported context size; use its specification and a supported format such as `256K`.                                        |
| Model options → Maximum output tokens | The model's output limit, such as `32K`; not a promise of that much output every turn.                                                  |
| Model options → Input types           | Text is required. Enable images only when the model supports them.                                                                      |

![Custom API form and per-model options](/guides/settings/model-provider-custom-zh.webp)

The catalog provider's **Custom settings** override its API URL and model list. With no catalog entries, DSH says the selector will show no models. Bot model presets also need an available catalog entry. Saving the provider alone does not finish Bot model selection.

## 2. Open the target Bot's Profile

Close Settings, enter **Bot mode**, and open the Bot's DM. Click its **name/avatar in the chat header → View details**, then scroll to and expand **Model preset**.

![Open PersonaBot Profile from the chat header, then choose View details](/guides/settings/model-profile-entry-zh.webp)

This page configures one Bot. Global **Bot settings** contain appearance, sorting, and concurrency options. DSH **Agent presets** choose tools and working style; they are separate from Bot model presets.

## 3. Create and apply a model preset

Under **Create a preset**, enter a name, select both models and their reasoning efforts, and choose **Create and apply**.

| Field / action               | Purpose                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Preset name                  | A reusable model combination, such as “Everyday assistant.”                                                                          |
| Orchestrator model           | The Bot's model for receiving messages, coordinating work, and everyday conversation.                                                |
| Assignment default model     | The default for newly created task sessions when no other model is chosen.                                                           |
| Reasoning effort             | An effort supported by the selected model. “Model default effort” leaves the effort unspecified. Models may offer different options. |
| Create and apply             | Save the template and an independent model snapshot for this Bot.                                                                    |
| Quick preset switch → Switch | Apply a saved template to this Bot. Selecting a dropdown entry alone does not apply it.                                              |

![Applied Bot snapshot showing Orchestrator and Assignment routes](/guides/settings/model-bot-preset-zh.webp)

Check **Independent snapshot for this Bot** for the expected `provider ID / model ID / effort`. Bots can share a template or use different combinations.

## 4. Customize a Bot and its Assignment choices

After applying a preset, these controls become available:

| Action                                                   | Scope                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Edit selected preset → Save preset revision              | Update the template for future applications. Existing Bot snapshots stay unchanged; switch each intended Bot to the revised preset again. |
| Customize this Bot's Orchestrator → Save custom snapshot | Change only this Bot's conversation model and effort. Does not edit the shared template.                                                  |
| Allowed Assignment models                                | Select the models this Bot may choose for new tasks; keep at least one.                                                                   |
| Allowed efforts                                          | Keep at least one effort for each allowed model.                                                                                          |
| Default effort for this model                            | Choose a default from that model's allowed efforts.                                                                                       |
| Assignment default model                                 | Choose the fallback from the selected models.                                                                                             |
| Save Assignment model choices                            | Save the model/effort range available to new tasks.                                                                                       |

Task model selection is fixed when the task is created. Changing a default does not reconfigure existing Assignments or rerun a response already being generated.

## 5. Verify the actual model

Return to chat and send a short message. After a reply, check the Profile's **Token usage**, grouped by model or provider. For a specific conversation, open its DSH Session from **Sessions** in the right sidebar and inspect the model selector and next-turn usage record.

![Actual Session model selector and reply after applying the preset](/guides/settings/model-session-verification-zh.webp)

The Profile snapshot and an open Session's model selection are separate visible states. For resumed sessions, check the model used by the next turn after saving; a saved label alone is not request verification. Inspect running tasks in their own sessions.

| Symptom                                     | Check                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| “No models are available”                   | Settings → Models: saved provider, working credentials, and catalog entries; then reopen Model preset.                          |
| “Current model unavailable” / repair needed | A provider/model may have been renamed or removed. Select and apply an available preset.                                        |
| Editing a template did not change a Bot     | Existing snapshots do not follow template revisions automatically. Click Switch on the target Bot.                              |
| No reply / service error                    | Check URL, protocol, key, model ID, and service quota. Complete a local DM first.                                               |
| Session model differs from the snapshot     | Inspect that Session's selector and next-turn usage; retain the result for feedback instead of repeatedly editing the template. |

Other fields and locations are covered in [Settings guide](/docs/settings). IM connections have separate [Lark / Feishu](/docs/lark-connection) and [Slack](/docs/slack-connection) guides.
