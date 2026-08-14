from pathlib import Path

path = Path("src/pages/DataConnectors.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, found {count}: {old[:140]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";\n',
    'import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";\n'
    'import { canUseConnectorInPilot, pilotConnectorBadge, pilotConnectorBlockReason } from "@/lib/pilot-readiness";\n',
)

replace_once(
    '        body: JSON.stringify({ connector_type: selectedType, data_source_id: connectorId, organization_id: currentOrgId, connector_id: connectorId }),\n',
    '        body: JSON.stringify({ connector_id: connectorId }),\n',
)

replace_once(
    '  const handleSelectConnector = (type: ConnectorType) => {\n'
    '    if (type === "csv_upload") { navigate("/data-upload"); return; }\n'
    '    setSelectedType(type);\n',
    '  const handleSelectConnector = (type: ConnectorType) => {\n'
    '    if (!canUseConnectorInPilot(type)) {\n'
    '      toast({\n'
    '        title: "Pilot connector not yet enabled",\n'
    '        description: pilotConnectorBlockReason(type) ?? "This connector is not enabled for the paid pilot.",\n'
    '        variant: "destructive",\n'
    '      });\n'
    '      return;\n'
    '    }\n'
    '    if (type === "csv_upload") { navigate("/data-upload"); return; }\n'
    '    setSelectedType(type);\n',
)

old_card = '''                        {group.map((conn) => {
                          const Icon = conn.icon;
                          const isBusiness = ["crm","erp","saas"].includes(conn.category);
                          return (
                            <Card
                              key={conn.type}
                              className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
                              onClick={() => handleSelectConnector(conn.type)}
                            >
                              <CardContent className="p-5">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{conn.label}</p>
                                    <div className="flex gap-1 mt-0.5 flex-wrap">
                                      {isBusiness && (
                                        <Badge variant="outline" className="text-[10px]">OAuth / API Key</Badge>
                                      )}
                                      {conn.category === "file" && (
                                        <Badge variant="outline" className="text-[10px]">Upload</Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">{conn.description}</p>
                              </CardContent>
                            </Card>
                          );
                        })}'''
new_card = '''                        {group.map((conn) => {
                          const Icon = conn.icon;
                          const isBusiness = ["crm","erp","saas"].includes(conn.category);
                          const pilotEnabled = canUseConnectorInPilot(conn.type);
                          return (
                            <Card
                              key={conn.type}
                              aria-disabled={!pilotEnabled}
                              className={pilotEnabled
                                ? "cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
                                : "cursor-not-allowed opacity-60 border-dashed"
                              }
                              onClick={() => handleSelectConnector(conn.type)}
                            >
                              <CardContent className="p-5">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-sm truncate">{conn.label}</p>
                                      <Badge variant={pilotEnabled ? "default" : "secondary"} className="text-[10px] whitespace-nowrap">
                                        {pilotConnectorBadge(conn.type)}
                                      </Badge>
                                    </div>
                                    <div className="flex gap-1 mt-0.5 flex-wrap">
                                      {isBusiness && (
                                        <Badge variant="outline" className="text-[10px]">OAuth / API Key</Badge>
                                      )}
                                      {conn.category === "file" && (
                                        <Badge variant="outline" className="text-[10px]">Upload</Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">{conn.description}</p>
                                {!pilotEnabled && (
                                  <p className="text-[10px] text-muted-foreground mt-2">Not enabled for live paid-pilot use yet.</p>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}'''
replace_once(old_card, new_card)

replace_once(
    '                  <p className="text-muted-foreground">Choose a data source to power your decision intelligence.</p>\n',
    '                  <p className="text-muted-foreground">Choose a pilot-certified data source. Salesforce and HubSpot are enabled for live connector pilots; CSV remains available for file intake.</p>\n',
)

path.write_text(text)
