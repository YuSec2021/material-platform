import { toast } from "sonner";
import { componentInventory, loadedComponentCount } from "@/app/dev/componentInventory";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../ui/tooltip";

export function ComponentSmoke() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900">Component Smoke</h3>
          <p className="mt-1 text-sm text-gray-500">
            Loaded shadcn/ui modules: {loadedComponentCount}
          </p>
        </div>
        <Badge variant="secondary">{loadedComponentCount} components loaded</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => toast.success("Toast component ready")}>Toast</Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog ready</DialogTitle>
                  <DialogDescription>
                    This dialog renders through the Sprint 13 React shell.
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">Tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip component ready</TooltipContent>
            </Tooltip>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select defaultValue="material">
              <SelectTrigger>
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">标准管理</SelectItem>
                <SelectItem value="material">物料管理</SelectItem>
                <SelectItem value="system">系统管理</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-3">
              <Checkbox id="component-smoke-checkbox" defaultChecked />
              <label htmlFor="component-smoke-checkbox" className="text-sm text-gray-700">
                Checkbox
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="component-smoke-switch" defaultChecked />
              <label htmlFor="component-smoke-switch" className="text-sm text-gray-700">
                Switch
              </label>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">Slider</span>
              <Slider defaultValue={[64]} max={100} step={1} className="max-w-40" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <Tabs defaultValue="table">
            <TabsList>
              <TabsTrigger value="table">Table</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
            </TabsList>
            <TabsContent value="table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {["Button", "Dialog", "Select", "Table", "Tabs", "Tooltip"].map((name) => (
                    <TableRow key={name}>
                      <TableCell>{name}</TableCell>
                      <TableCell>
                        <Badge>ready</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="inventory">
              <div className="flex max-h-72 flex-wrap gap-2 overflow-auto pt-2">
                {componentInventory.map((item) => (
                  <Badge key={item.name} variant="outline">
                    {item.name}
                  </Badge>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
