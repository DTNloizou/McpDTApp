# Entities Reference

> **Purpose:** Cached entity IDs and topology to avoid repeated `find_entity_by_name` lookups
> **Last Updated:** [DATE]
> **Update Rule:** Add new entities whenever discovered via MCP queries

---

## 🏢 Service Entities

### Web Services (Frontend Applications)
| Service Name | Entity ID | Description | Type | Last Verified |
|--------------|-----------|-------------|------|---------------|
| *(Add as discovered)* | | | | |

### Backend Services / APIs
| Service | Entity ID | Description | Last Verified |
|---------|-----------|-------------|---------------|
| *(Add as discovered)* | | | |

### Azure Functions / Serverless
| Service | Entity ID | Description | Last Verified |
|---------|-----------|-------------|---------------|
| *(Add as discovered)* | | | |

**Note:** When discovering services, document error volumes and key characteristics alongside entity IDs.

---

## 🖥️ Host Entities

| Host Name | Entity ID | Description | Last Verified |
|-----------|-----------|-------------|---------------|
| *(Add as discovered)* | | | |

---

## 🖥️ Process Entities

| Process Name | Entity ID | Type | Last Verified |
|--------------|-----------|------|---------------|
| *(Add as discovered)* | | | |

---

## 📦 Container Entities

| Container Name | Entity ID | Pod/Host | Last Verified |
|----------------|-----------|----------|---------------|
| *(Add as discovered)* | | | |

---

## 📱 RUM Application Entities

| Application Name | Entity ID | Frontend ID | Description | Last Verified |
|-----------------|-----------|-------------|-------------|---------------|
| *(Add as discovered)* | | | | |

**Note:** RUM applications track real user monitoring data (sessions, page views, errors, performance)

### Key RUM Queries
```dql
// Session analysis (requires scope: user.sessions)
fetch user.sessions, from:now()-7d
| filter in(dt.rum.application.entities, "APPLICATION-XXX")
| summarize sessions = count(), avg_duration = avg(duration), errors = sum(error.count)

// JavaScript errors
fetch user.events, from:now()-24h
| filter dt.rum.application.entity == "APPLICATION-XXX" and error.type == "javascript"
| summarize count = count(), sessions = countDistinct(dt.rum.session.id), by:{error.message}
```

---

## ☸️ Kubernetes Entities

### Clusters
| Cluster Name | Entity ID | Last Verified |
|--------------|-----------|---------------|
| *(Add as discovered)* | | |

### Namespaces
| Namespace | Entity ID | Cluster | Last Verified |
|-----------|-----------|---------|---------------|
| *(Add as discovered)* | | | |

### Pods
| Pod Name | Entity ID | Namespace | Last Verified |
|----------|-----------|-----------|---------------|
| *(Add as discovered)* | | | |

---

## 🌐 Application Entities (RUM/Frontend)

### Web Applications
| Application Name | Entity ID | Type | Last Verified |
|------------------|-----------|------|---------------|
| *(Add as discovered)* | | | |

### Mobile Applications
| Application Name | Entity ID | Platform | Last Verified |
|------------------|-----------|----------|---------------|
| *(Add as discovered)* | | | |

---

## 🔗 Entity Relationships

### Topology Map
```
SERVICE-XXXX (Primary Service)
    └── PROCESS-XXXX (Process)
        └── HOST-XXXX (Host)
            └── CLOUD_APPLICATION-XXXX (K8s Workload)
```

*(Update this diagram as you discover topology)*

---

## 🔍 DQL Filters for Entities

### Service Filter
```dql
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
```

### Host Filter
```dql
| filter dt.entity.host == "HOST-XXXXXXXXXXXX"
```

### Process Filter
```dql
| filter dt.entity.process_group == "PROCESS_GROUP-XXXXXXXXXXXX"
```

### Multiple Entity Filter
```dql
| filter dt.entity.service in ("SERVICE-ID1", "SERVICE-ID2", "SERVICE-ID3")
```

---

## 🔄 Entity Discovery Queries

### Find Service by Name
Use MCP tool: `find_entity_by_name("service-name")`

### List All Services in Smartscape
```dql
smartscapeNodes "SERVICE"
| fields entity.name, dt.entity.service
| limit 50
```

### Find Related Entities
```dql
smartscapeNodes "SERVICE"
| filter dt.entity.service == "SERVICE-XXXXXXXXXXXX"
| expand to:dt.entity.process_group, direction:both
```

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entries:

### [DATE] - Service Discovery
- **Source:** find_entity_by_name query
- **Finding:** Discovered 15 backend services
- **Data:** Added SERVICE-IDs for API services

### [DATE] - Host Mapping
- **Source:** Smartscape topology query
- **Finding:** Mapped hosts to Kubernetes pods
- **Data:** Added HOST-IDs for production cluster
-->

---

## 🔄 How to Update This File

When you discover new entities:
1. Use `find_entity_by_name` first (FREE query)
2. Add entity to appropriate section with full details
3. Document any error volumes or performance characteristics
4. Add to Update Log with source query
5. Use entity IDs in subsequent queries (avoid repeat lookups)

### Host Filter
```dql
| filter dt.entity.host == "HOST-XXXXXXXXXXXX"
```

### Application Filter (RUM)
```dql
| filter dt.rum.application.entity == "APPLICATION-XXXXXXXXXXXX"
```

### Kubernetes Cluster Filter
```dql
| filter dt.entity.kubernetes_cluster == "KUBERNETES_CLUSTER-XXXXXXXXXXXX"
```

---

## 📝 Update Log

### [DATE] - Initial Setup
- **Source:** Workspace initialization
- **Finding:** Reference file created
- **Data:** Template ready for population

<!--
Example update entry:

### [DATE] - [Entity Name]
- **Source:** `find_entity_by_name("[name]")`
- **Finding:** Discovered [X] entities for [service/application]
- **Data:** Primary entity is `SERVICE-XXXX` ([description])
-->

---

## 🔄 How to Update This File

When you discover a new entity via MCP:
1. Add it to the appropriate section above
2. Include: Entity Name, Entity ID, Type, Last Verified date
3. Add to Update Log with source query
4. Update relationships if topology is clarified

### Example Update Entry
```markdown
### [DATE] - My Service
- **Source:** `find_entity_by_name("My Service")`
- **Finding:** Discovered 5 entities for My Service
- **Data:** Primary service is `SERVICE-XXXXXXXXXXXX` (my-service.example.com:8080)
```
