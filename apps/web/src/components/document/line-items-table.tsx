"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { MoneyInput } from "@/components/money/money-input";
import { PercentInput } from "@/components/money/percent-input";
import { QuantityInput } from "@/components/money/quantity-input";
import { NumericCell } from "@/components/money/numeric-cell";
import {
  DiscountControl,
  type DiscountValue,
} from "@/components/document/discount-control";
import { LineDerivationTape } from "@/components/tape/derivation-tape";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import {
  formatDiscountInput,
  formatTaxInput,
  type CurrencyCode,
} from "@/lib/money";
import type { DocumentDto, LineDto, LineInputDto } from "@/lib/api";
import { isOptimistic } from "@/lib/hooks";

interface LineItemsTableProps {
  document: DocumentDto;
  editable: boolean;
  pending?: boolean;

  errors?: Record<string, string>;
  onUpdate: (lineId: string, input: LineInputDto) => void;
  onDelete: (lineId: string) => void;
  onAdd: () => void;
  onReorder: (order: string[]) => void;
}

function toInput(line: LineDto): LineInputDto {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountType: line.discountType,
    discountPercentBp: line.discountPercentBp,
    discountFixedMinor: line.discountFixedMinor,
    taxPercentBp: line.taxPercentBp,
  };
}

export function LineItemsTable({
  document,
  editable,
  pending = false,
  errors = {},
  onUpdate,
  onDelete,
  onAdd,
  onReorder,
}: LineItemsTableProps) {
  const currency = document.currency as CurrencyCode;
  const lines = document.lines ?? [];
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [allColumns, setAllColumns] = React.useState(false);
  const [localErrors, setLocalErrors] = React.useState<Record<string, string>>(
    {},
  );

  const columnCount = 8 + (editable ? 1 : 0) + (allColumns ? 4 : 0);

  function toggle(lineId: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function setLocalError(lineId: string, message: string | null): void {
    setLocalErrors((current) => {
      const next = { ...current };
      if (message) next[lineId] = message;
      else delete next[lineId];
      return next;
    });
  }

  function move(lineId: string, direction: -1 | 1): void {
    const order = lines.map((line) => line.id);
    const index = order.indexOf(lineId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    onReorder(order);
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        Icon={Plus}
        title="No items yet"
        description={
          editable
            ? "Add your first item to start building this document."
            : "This document has no items."
        }
        action={
          editable ? (
            <Button size="sm" onClick={onAdd}>
              <Plus />
              Add your first item
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Items</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[0.75rem] text-muted-foreground"
          onClick={() => setAllColumns((value) => !value)}
        >
          {allColumns ? "Hide" : "Show"} all columns
        </Button>
      </div>

      <div className="border border-border">

        <Table className="[&_input]:text-left [&_td]:text-left [&_th]:text-left">
          <TableHeader>
            <TableRow>
              {editable && <TableHead className="w-8" />}
              <TableHead className="w-8 text-right">#</TableHead>
              <TableHead className="min-w-48">Description</TableHead>

              <TableHead numeric className="w-28">
                Qty
              </TableHead>
              <TableHead numeric className="w-32">
                Unit price
              </TableHead>
              <TableHead className="w-52">Discount</TableHead>
              <TableHead numeric className="w-28">
                Tax
              </TableHead>
              {allColumns && (
                <>
                  <TableHead numeric className="w-28">
                    Subtotal
                  </TableHead>
                  <TableHead numeric className="w-28">
                    Discount amt
                  </TableHead>
                  <TableHead numeric className="w-28">
                    After discount
                  </TableHead>
                  <TableHead numeric className="w-24">
                    Tax amt
                  </TableHead>
                </>
              )}
              <TableHead numeric className="w-32">
                Item total
              </TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {lines.map((line, index) => {
              const error = errors[line.id] ?? localErrors[line.id];
              const isExpanded = expanded.has(line.id);

              const provisional = isOptimistic(line.id);
              const rowEditable = editable && !provisional;

              return (
                <React.Fragment key={line.id}>
                  <TableRow
                    className={cn(
                      error && "bg-destructive/5",
                      provisional && "opacity-60",
                    )}
                  >

                    {editable && (
                      <TableCell className="px-1">
                        <div className={cn('flex flex-col', provisional && 'invisible')}>
                          <button
                            type="button"
                            aria-label={`Move ${line.description} up`}
                            disabled={index === 0}
                            onClick={() => move(line.id, -1)}
                            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                          >
                            <ChevronUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${line.description} down`}
                            disabled={index === lines.length - 1}
                            onClick={() => move(line.id, 1)}
                            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                          >
                            <ChevronDown className="size-3" />
                          </button>
                        </div>
                      </TableCell>
                    )}

                    <TableCell numeric className="text-muted-foreground">
                      {line.position}
                    </TableCell>

                    <TableCell>
                      {rowEditable ? (
                        <Input
                          defaultValue={line.description}
                          aria-label="Description"
                          className="h-9"
                          onBlur={(event) => {
                            const description = event.target.value.trim();

                            if (!description) {
                              event.target.value = line.description;
                              return;
                            }
                            if (description !== line.description) {
                              onUpdate(line.id, {
                                ...toInput(line),
                                description,
                              });
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              event.currentTarget.blur();
                          }}
                        />
                      ) : (
                        line.description
                      )}
                    </TableCell>

                    <TableCell numeric>
                      {rowEditable ? (
                        <QuantityInput
                          value={line.quantity}
                          aria-label="Quantity"
                          invalid={Boolean(error)}
                          onParseError={(message) =>
                            setLocalError(line.id, message)
                          }

                          className="min-w-20"
                          onCommit={(quantity) =>
                            onUpdate(line.id, { ...toInput(line), quantity })
                          }
                        />
                      ) : (
                        line.quantity
                      )}
                    </TableCell>

                    <TableCell numeric>
                      {rowEditable ? (
                        <MoneyInput
                          valueMinor={line.unitPriceMinor}
                          currency={currency}
                          aria-label="Unit price"
                          className="min-w-28"
                          onParseError={(message) =>
                            setLocalError(line.id, message)
                          }
                          invalid={Boolean(error)}
                          onCommit={(unitPriceMinor) =>
                            onUpdate(line.id, {
                              ...toInput(line),
                              unitPriceMinor,
                            })
                          }
                        />
                      ) : (
                        <NumericCell
                          amountMinor={line.unitPriceMinor}
                          currency={currency}
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {rowEditable ? (
                        <DiscountControl
                          currency={currency}
                          invalid={Boolean(error)}
                          onParseError={(message) =>
                            setLocalError(line.id, message)
                          }
                          value={{
                            discountType: line.discountType,
                            discountPercentBp: line.discountPercentBp,
                            discountFixedMinor: line.discountFixedMinor,
                          }}
                          onChange={(next: DiscountValue) =>
                            onUpdate(line.id, { ...toInput(line), ...next })
                          }
                        />
                      ) : (
                        <span className="tabular">
                          {formatDiscountInput(
                            line.discountType,
                            line.discountPercentBp,
                            line.discountFixedMinor,
                            currency,
                          )}
                        </span>
                      )}
                    </TableCell>

                    <TableCell numeric>
                      {rowEditable ? (
                        <PercentInput
                          valueBp={line.taxPercentBp}
                          aria-label="Tax percent"

                          className="min-w-20"
                          onParseError={(message) =>
                            setLocalError(line.id, message)
                          }
                          invalid={Boolean(error)}
                          onCommit={(taxPercentBp) =>
                            onUpdate(line.id, {
                              ...toInput(line),
                              taxPercentBp,
                            })
                          }
                        />
                      ) : (
                        <span className="tabular">
                          {formatTaxInput(line.taxPercentBp)}
                        </span>
                      )}
                    </TableCell>

                    {allColumns && (
                      <>
                        <TableCell numeric>
                          <NumericCell
                            amountMinor={line.lineSubtotalMinor}
                            currency={currency}
                            pending={pending}
                          />
                        </TableCell>
                        <TableCell numeric>
                          {line.discountAmountMinor === 0 ? (
                            <NumericCell
                              amountMinor={0}
                              currency={currency}
                              tone="muted"
                            />
                          ) : (
                            <NumericCell
                              amountMinor={line.discountAmountMinor}
                              currency={currency}
                              tone="discount"
                              sign="minus"
                              pending={pending}
                            />
                          )}
                        </TableCell>
                        <TableCell numeric>
                          <NumericCell
                            amountMinor={line.afterDiscountMinor}
                            currency={currency}
                            pending={pending}
                          />
                        </TableCell>
                        <TableCell numeric>
                          {line.taxAmountMinor === 0 ? (
                            <NumericCell
                              amountMinor={0}
                              currency={currency}
                              tone="muted"
                            />
                          ) : (
                            <NumericCell
                              amountMinor={line.taxAmountMinor}
                              currency={currency}
                              tone="tax"
                              sign="plus"
                              pending={pending}
                            />
                          )}
                        </TableCell>
                      </>
                    )}

                    <TableCell numeric>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            onClick={() => toggle(line.id)}
                            aria-expanded={isExpanded}
                            aria-label={`How item ${line.position} was calculated`}
                            className="tabular cursor-help underline decoration-dotted decoration-from-font underline-offset-4"
                          >
                            <NumericCell
                              amountMinor={line.lineTotalMinor}
                              currency={currency}
                              emphasis
                              pending={pending}
                            />
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent align="end" className="w-auto">
                          <LineDerivationTape
                            line={line}
                            currency={currency}
                            density="compact"
                          />
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggle(line.id)}
                          aria-label={
                            isExpanded
                              ? "Hide the calculation"
                              : "Show the calculation"
                          }
                          className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <GripVertical className="size-3.5 rotate-90" />
                          )}
                        </button>
                        {rowEditable && (
                          <button
                            type="button"
                            onClick={() => onDelete(line.id)}
                            aria-label={`Remove ${line.description}`}
                            className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {error && (
                    <TableRow className="border-b-0 bg-destructive/5 hover:bg-destructive/5">
                      <TableCell
                        colSpan={columnCount}
                        className="pt-0"
                      >
                        <p className="text-[0.8125rem] text-destructive mt-2">
                          {error}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}

                  <TableRow className="border-b-0 hover:bg-transparent">
                    <TableCell colSpan={columnCount} className="p-0">
                      <Collapsible open={isExpanded}>
                        <CollapsibleContent>
                          <div className="flex justify-end bg-muted/40 px-3 py-3">
                            <LineDerivationTape
                              line={line}
                              currency={currency}
                              density="expanded"
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editable && (
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus />
          Add Item
        </Button>
      )}
    </div>
  );
}
