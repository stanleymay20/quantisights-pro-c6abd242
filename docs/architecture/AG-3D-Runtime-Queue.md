# AG-3D — Enterprise Runtime Queue

## Purpose

AG-3D defines the storage-agnostic queue boundary for the Quantivis Runtime Gateway. It provides deterministic message lifecycle behavior, retry handling, dead-letter routing, and queue statistics without binding Quantivis to Kafka, RabbitMQ, SQS, Azure Service Bus, Google Pub/Sub, Supabase Queues, Redis Streams, or any other external queue backend.

This phase is a contract and deterministic in-memory implementation only. It does not introduce background workers, timers, HTTP endpoints, persistence backends, connectors, AG-2 changes, RTS-1 changes, or runtime-service changes.

## Queue lifecycle

Runtime queue messages move through these states:

```text
QUEUED
  ↓ dequeue()
PROCESSING
  ↓ ack()
ACKNOWLEDGED

PROCESSING
  ↓ retry()
RETRY
  ↓ dequeue() when available_at is reached
PROCESSING

PROCESSING
  ↓ retry threshold reached / moveToDeadLetter()
DEAD_LETTER

QUEUED / RETRY / PROCESSING
  ↓ expires_at reached
EXPIRED

ACKNOWLEDGED / EXPIRED / PURGED
  ↓ purge()
removed from active adapter storage
```

## Queue record

Each queue record includes:

- `queue_message_id`
- `correlation_id`
- `idempotency_key`
- `request_hash`
- `tenant_id`
- `organization_id`
- `payload_reference`
- `created_at`
- `available_at`
- `attempt_count`
- `status`
- `priority`
- `expires_at`
- retry lineage
- failure and completion metadata

The queue stores a payload reference, not the full runtime request payload. Durable payload storage remains a later backend concern.

## Retry lifecycle

Retry behavior is deterministic and configuration-driven:

- `max_attempts`
- `retry_delay_ms`
- `dead_letter_threshold`

The queue does not create timers or background workers. A retry only changes state and advances `available_at`. A worker or future runtime endpoint decides when to call `dequeue()`.

## Dead-letter lifecycle

Messages move to `DEAD_LETTER` when retry thresholds are reached or when `moveToDeadLetter()` is called explicitly.

Dead-letter records retain:

- `correlation_id`
- `request_hash`
- `retry_history`
- `failure_reason`
- `dead_letter_reason`

This preserves enough lineage for later audit, operator review, and certification evidence.

## Adapter model

The adapter contract is:

- `enqueue()`
- `peek()`
- `dequeue()`
- `ack()`
- `retry()`
- `deadLetter()`
- `stats()`
- `purge()`

AG-3D ships a deterministic in-memory adapter for tests and local deterministic behavior. Production persistence should plug into this adapter boundary without changing the runtime queue API.

## Future backend mappings

Future queue adapters can map this contract to:

- Kafka topic + consumer group offsets
- AWS SQS message visibility and dead-letter queues
- Azure Service Bus queues and DLQs
- Google Pub/Sub topics/subscriptions
- RabbitMQ exchanges/queues
- Supabase Queues
- Redis Streams

Those systems are intentionally not implemented in AG-3D.

## Ordering guarantees

The deterministic in-memory adapter orders available messages by:

1. Higher `priority`
2. Earlier `created_at`
3. Lexicographic `queue_message_id`

Distributed queue adapters must document any weaker ordering guarantees in their own implementation documents.

## Delivery guarantees

AG-3D models at-least-once delivery semantics:

- `dequeue()` moves an available message to `PROCESSING`.
- `ack()` records successful completion.
- `retry()` returns the message to future availability or dead-letters it.
- idempotency and replay protection remain handled by AG-3C.

Exactly-once execution is not claimed by the queue. Exactly-once business effects require AG-3C idempotency plus downstream transactional persistence.

## Queue statistics

`queueStats()` exposes:

- queue depth
- processing count
- retry count
- dead-letter count
- expired count
- acknowledged count
- purged count

Statistics are adapter-derived and deterministic for the in-memory implementation.

## Verified status

Implemented in AG-3D:

- queue contracts
- deterministic in-memory adapter
- enqueue/dequeue/ack/retry/dead-letter/purge/statistics behavior
- focused regression coverage

Deferred:

- external queues
- workers
- runtime submission
- persistent payload store
- observability events
- production deployment
