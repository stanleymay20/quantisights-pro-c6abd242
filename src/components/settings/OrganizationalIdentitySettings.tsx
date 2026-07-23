import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrganizationalIdentity, type IdentityUpdateInput, type StakeholderEntry } from "@/hooks/useOrganizationalIdentity";
import {
  Save, Loader2, Plus, X, Target, Eye, Heart, Shield, Compass,
  Users, Scale, Zap, Globe, Building2, AlertTriangle,
} from "lucide-react";

interface Props {
  organizationId: string | null;
}

const TagInput = ({
  label, description, icon: Icon, values, onChange, placeholder,
}: {
  label: string; description: string; icon: React.ElementType; values: string[];
  onChange: (v: string[]) => void; placeholder: string;
}) => {
  const [input, setInput] = useState("");
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!input.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {values.map((v, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1">
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
};

const OrganizationalIdentitySettings = ({ organizationId }: Props) => {
  const { toast } = useToast();
  const { identity, loading, saving, saveIdentity, completenessScore } = useOrganizationalIdentity(organizationId);

  // Local form state
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [coreValues, setCoreValues] = useState<string[]>([]);
  const [strategicPriorities, setStrategicPriorities] = useState<string[]>([]);
  const [riskAppetite, setRiskAppetite] = useState("moderate");
  const [innovationPosture, setInnovationPosture] = useState("balanced");
  const [decisionSpeed, setDecisionSpeed] = useState("balanced");
  const [stakeholderOrientation, setStakeholderOrientation] = useState("balanced");
  const [decisionPrinciples, setDecisionPrinciples] = useState<string[]>([]);
  const [ethicalBoundaries, setEthicalBoundaries] = useState<string[]>([]);
  const [governanceModel, setGovernanceModel] = useState("collaborative");
  const [competitivePosition, setCompetitivePosition] = useState("");
  const [regulatoryEnv, setRegulatoryEnv] = useState("");
  const [marketStage, setMarketStage] = useState("growth");
  const [industryContext, setIndustryContext] = useState("");
  const [stakeholders, setStakeholders] = useState<StakeholderEntry[]>([]);

  // Sync from loaded identity
  useEffect(() => {
    if (identity) {
      setVision(identity.vision_statement ?? "");
      setMission(identity.mission_statement ?? "");
      setCoreValues(identity.core_values);
      setStrategicPriorities(identity.strategic_priorities);
      setRiskAppetite(identity.risk_appetite);
      setInnovationPosture(identity.innovation_posture);
      setDecisionSpeed(identity.decision_speed_preference);
      setStakeholderOrientation(identity.stakeholder_orientation);
      setDecisionPrinciples(identity.decision_principles);
      setEthicalBoundaries(identity.ethical_boundaries);
      setGovernanceModel(identity.governance_model);
      setCompetitivePosition(identity.competitive_position ?? "");
      setRegulatoryEnv(identity.regulatory_environment ?? "");
      setMarketStage(identity.market_stage);
      setIndustryContext(identity.industry_context ?? "");
      setStakeholders(identity.key_stakeholders);
    }
  }, [identity]);

  const handleSave = useCallback(async () => {
    const updates: IdentityUpdateInput = {
      vision_statement: vision || null,
      mission_statement: mission || null,
      core_values: coreValues,
      strategic_priorities: strategicPriorities,
      risk_appetite: riskAppetite,
      innovation_posture: innovationPosture,
      decision_speed_preference: decisionSpeed,
      stakeholder_orientation: stakeholderOrientation,
      decision_principles: decisionPrinciples,
      ethical_boundaries: ethicalBoundaries,
      governance_model: governanceModel,
      competitive_position: competitivePosition || null,
      regulatory_environment: regulatoryEnv || null,
      market_stage: marketStage,
      industry_context: industryContext || null,
      key_stakeholders: stakeholders,
    };
    try {
      await saveIdentity(updates);
      toast({ title: "Identity profile saved", description: "Organizational identity updated — this will influence all future decision intelligence." });
    } catch (err: unknown) {
      toast({ title: "Error saving", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  }, [vision, mission, coreValues, strategicPriorities, riskAppetite, innovationPosture, decisionSpeed, stakeholderOrientation, decisionPrinciples, ethicalBoundaries, governanceModel, competitivePosition, regulatoryEnv, marketStage, industryContext, stakeholders, saveIdentity, toast]);

  const addStakeholder = () => {
    setStakeholders(prev => [...prev, { name: "", role: "", influence: "medium", interest: "medium" }]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Completeness Indicator */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="w-5 h-5 text-primary" />
            Identity Profile Completeness
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={completenessScore} className="flex-1" />
            <span className="text-sm font-semibold text-muted-foreground">{completenessScore}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            A complete profile enables mission-alignment scoring on all decisions and recommendations.
          </p>
        </CardContent>
      </Card>

      {/* Vision & Mission */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-primary" /> Vision & Mission</CardTitle>
          <CardDescription>Define where your organization is going and why it exists.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vision-statement">Vision Statement</Label>
            <Textarea id="vision-statement" value={vision} onChange={(e) => setVision(e.target.value)} placeholder="Our long-term aspirational goal..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mission-statement">Mission Statement</Label>
            <Textarea id="mission-statement" value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Why our organization exists and what we do..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Values & Priorities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-primary" /> Values & Strategic Priorities</CardTitle>
          <CardDescription>Core values shape culture. Strategic priorities drive decision alignment scoring.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TagInput
            label="Core Values"
            description="The non-negotiable principles that guide behavior and decisions"
            icon={Heart}
            values={coreValues}
            onChange={setCoreValues}
            placeholder="e.g., Integrity, Innovation, Customer-First"
          />
          <TagInput
            label="Strategic Priorities"
            description="Top 3-5 strategic goals driving resource allocation"
            icon={Target}
            values={strategicPriorities}
            onChange={setStrategicPriorities}
            placeholder="e.g., Market expansion in APAC, Reduce CAC by 30%"
          />
        </CardContent>
      </Card>

      {/* Culture & Decision Philosophy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> Culture & Decision Philosophy</CardTitle>
          <CardDescription>How your organization approaches risk, innovation, and strategic speed.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Risk Appetite</Label>
            <Select value={riskAppetite} onValueChange={setRiskAppetite}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative — Preserve capital, minimize downside</SelectItem>
                <SelectItem value="moderate">Moderate — Balanced risk-reward</SelectItem>
                <SelectItem value="aggressive">Aggressive — Pursue high-reward opportunities</SelectItem>
                <SelectItem value="visionary">Visionary — Transform markets, accept high uncertainty</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Innovation Posture</Label>
            <Select value={innovationPosture} onValueChange={setInnovationPosture}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="defender">Defender — Protect existing position</SelectItem>
                <SelectItem value="balanced">Balanced — Incremental innovation</SelectItem>
                <SelectItem value="explorer">Explorer — Actively seek new opportunities</SelectItem>
                <SelectItem value="disruptor">Disruptor — Create new markets</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Decision Speed Preference</Label>
            <Select value={decisionSpeed} onValueChange={setDecisionSpeed}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deliberate">Deliberate — Thorough analysis before action</SelectItem>
                <SelectItem value="balanced">Balanced — Adequate analysis, timely action</SelectItem>
                <SelectItem value="agile">Agile — Fast iteration, learn by doing</SelectItem>
                <SelectItem value="rapid">Rapid — Speed is competitive advantage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Stakeholder Orientation</Label>
            <Select value={stakeholderOrientation} onValueChange={setStakeholderOrientation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shareholder">Shareholder — Maximize returns</SelectItem>
                <SelectItem value="balanced">Balanced — Multi-stakeholder value</SelectItem>
                <SelectItem value="stakeholder">Stakeholder — Broad value creation</SelectItem>
                <SelectItem value="community">Community — Social impact priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Decision Governance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scale className="w-5 h-5 text-primary" /> Decision Principles & Governance</CardTitle>
          <CardDescription>Rules and boundaries that constrain and guide strategic decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Governance Model</Label>
            <Select value={governanceModel} onValueChange={setGovernanceModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="centralized">Centralized — CEO/Board makes key decisions</SelectItem>
                <SelectItem value="collaborative">Collaborative — C-suite consensus</SelectItem>
                <SelectItem value="delegated">Delegated — Empowered leaders decide</SelectItem>
                <SelectItem value="consensus">Consensus — Broad agreement required</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TagInput
            label="Decision Principles"
            description="Guiding rules for how decisions should be made"
            icon={Shield}
            values={decisionPrinciples}
            onChange={setDecisionPrinciples}
            placeholder="e.g., Data over opinions, Customer impact first"
          />
          <TagInput
            label="Ethical Boundaries"
            description="Lines the organization will not cross — used to flag misaligned recommendations"
            icon={AlertTriangle}
            values={ethicalBoundaries}
            onChange={setEthicalBoundaries}
            placeholder="e.g., No user data monetization, Environmental sustainability"
          />
        </CardContent>
      </Card>

      {/* External Context */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> External Context</CardTitle>
          <CardDescription>Market, competitive, and regulatory factors that influence decisions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Market Stage</Label>
              <Select value={marketStage} onValueChange={setMarketStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="startup">Startup — Finding product-market fit</SelectItem>
                  <SelectItem value="growth">Growth — Scaling operations</SelectItem>
                  <SelectItem value="mature">Mature — Optimizing efficiency</SelectItem>
                  <SelectItem value="turnaround">Turnaround — Restructuring</SelectItem>
                  <SelectItem value="decline">Decline — Managing contraction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry-context">Industry Context</Label>
              <Input id="industry-context" value={industryContext} onChange={(e) => setIndustryContext(e.target.value)} placeholder="e.g., B2B SaaS, Healthcare, Manufacturing" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="competitive-position">Competitive Position</Label>
            <Textarea id="competitive-position" value={competitivePosition} onChange={(e) => setCompetitivePosition(e.target.value)} placeholder="Key competitive advantages and market position..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="regulatory-env">Regulatory Environment</Label>
            <Textarea id="regulatory-env" value={regulatoryEnv} onChange={(e) => setRegulatoryEnv(e.target.value)} placeholder="Key regulations, compliance requirements, political factors..." rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Stakeholder Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Key Stakeholders</CardTitle>
          <CardDescription>Map stakeholder influence and interest to contextualize decision impact.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stakeholders.map((s, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end p-3 rounded-lg border border-border/40 bg-muted/20">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={s.name} onChange={(e) => {
                  const updated = [...stakeholders];
                  updated[i] = { ...s, name: e.target.value };
                  setStakeholders(updated);
                }} placeholder="Board, Investors..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Input value={s.role} onChange={(e) => {
                  const updated = [...stakeholders];
                  updated[i] = { ...s, role: e.target.value };
                  setStakeholders(updated);
                }} placeholder="Governance, Funding..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Influence</Label>
                <Select value={s.influence} onValueChange={(v: "high" | "medium" | "low") => {
                  const updated = [...stakeholders];
                  updated[i] = { ...s, influence: v };
                  setStakeholders(updated);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Interest</Label>
                <Select value={s.interest} onValueChange={(v: "high" | "medium" | "low") => {
                  const updated = [...stakeholders];
                  updated[i] = { ...s, interest: v };
                  setStakeholders(updated);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStakeholders(stakeholders.filter((_, j) => j !== i))}>
                <X className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addStakeholder} className="gap-2">
            <Plus className="w-4 h-4" /> Add Stakeholder
          </Button>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Organizational Identity
        </Button>
      </div>
    </div>
  );
};

export default OrganizationalIdentitySettings;
