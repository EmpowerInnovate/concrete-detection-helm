# Technical Architecture & Deployment Guide: Multi-Domain Routing with Hostinger, AWS Route 53 & GCP GKE

---

## 1. Executive Summary & Architectural Overview

This document provides a comprehensive technical breakdown of how **two distinct domain names**, registered via **Hostinger** and managed across **GCP Cloud DNS** and **AWS Route 53**, route to a **single Static Ingress IP** on Google Kubernetes Engine (GKE), secured by a single **Google-Managed SSL Certificate** (`concrete-gallery-cert`) covering both domains as Subject Alternative Names (SAN).

---

## 2. End-to-End Multi-Domain Architecture Diagram

### A. High-Level Flowchart (Mermaid)

```mermaid
graph TD
    subgraph Hostinger["1. Hostinger (Domain Registrar)"]
        H1["Domain 1: maheshconcretegallery.online<br/>Custom Nameservers ➔ GCP Cloud DNS"]
        H2["Domain 2: concretecrackgallery.online<br/>Custom Nameservers ➔ AWS Route 53"]
    end

    subgraph DNSProviders["2. Managed DNS Providers"]
        subgraph GCPDNS["GCP Cloud DNS Zone"]
            G1["NS: ns-cloud-a1.googledomains.com ..."]
            G2["A Record: maheshconcretegallery.online<br/>TTL: 300 ➔ 34.xxx.xxx.xxx"]
        end

        subgraph AWSDNS["AWS Route 53 Hosted Zone"]
            A1["NS: ns-xxxx.awsdns-xx.org ..."]
            A2["A Record: mahesh.concretecrackgallery.online<br/>Simple Routing ➔ 34.xxx.xxx.xxx"]
        end
    end

    subgraph GCPInfra["3. GCP Infrastructure & GKE Cluster"]
        StaticIP["Static Global External IP<br/>concrete-detection-ip (34.xxx.xxx.xxx)"]
        
        ManagedCert["Google Managed Certificate<br/>Name: concrete-gallery-cert<br/>Namespace: default<br/>Domains:<br/>- mahesh.concretecrackgallery.online<br/>- maheshconcretegallery.online"]
        
        GCEIngress["GKE GCE Load Balancer / Ingress<br/>concrete-gallery-ingress<br/>Namespace: default"]
        
        subgraph K8sRouting["4. Kubernetes Path Routing & Services"]
            Rule1["Host 1: mahesh.concretecrackgallery.online (AWS Domain)"]
            Rule2["Host 2: maheshconcretegallery.online (GCP Domain)"]
            
            GallerySvc["Gallery Service<br/>concrete-image-gallery-svc-lb:8082<br/>Path: /"]
            UploadSvc["Upload Service<br/>image-upload-svc-lb:8080<br/>Paths: /upload, /uploaded"]
        end
    end

    H1 -->|"NS Delegation"| G1
    H2 -->|"NS Delegation"| A1

    G2 -->|"Resolves to Ingress IP"| StaticIP
    A2 -->|"Resolves to Ingress IP"| StaticIP

    StaticIP --- GCEIngress
    ManagedCert ---|"SSL/TLS Certificate Binding"| GCEIngress

    GCEIngress --> Rule1
    GCEIngress --> Rule2

    Rule1 -->|"Path: /"| GallerySvc
    Rule1 -->|"Paths: /upload, /uploaded"| UploadSvc

    Rule2 -->|"Path: /"| GallerySvc
    Rule2 -->|"Paths: /upload, /uploaded"| UploadSvc
```

---

### B. ASCII Infrastructure Flow Diagram

```
+-----------------------------------------------------------------------------------+
|                            1. HOSTINGER (REGISTRAR)                               |
|                                                                                   |
|  [ maheshconcretegallery.online ]              [ concretecrackgallery.online ]    |
|   Nameservers: ns-cloud-a1.googledomains...     Nameservers: ns-xxxx.awsdns...    |
+--------------------------+----------------------------------+---------------------+
                           |                                  |
                           v                                  v
+-----------------------------------------------------------------------------------+
|                            2. MANAGED DNS PROVIDERS                               |
|                                                                                   |
|   GCP Cloud DNS (Zone: concrete-zone-1)        AWS Route 53 (Hosted Zone)         |
|   A Record: maheshconcretegallery.online       A Record: mahesh.concretecrack...  |
|   Target IP: 34.xxx.xxx.xxx                    Target IP: 34.xxx.xxx.xxx          |
+--------------------------+----------------------------------+---------------------+
                           |                                  |
                           +------------------+---------------+
                                              |
                                              v
+-----------------------------------------------------------------------------------+
|                        3. GCP GKE INGRESS & SSL CERTIFICATE                       |
|                                                                                   |
|                      Static External IP: concrete-detection-ip                    |
|                                 (34.xxx.xxx.xxx)                                  |
|                                         |                                         |
|                 +-----------------------+-----------------------+                 |
|                 |  Google-Managed Certificate                   |                 |
|                 |  Name: concrete-gallery-cert                  |                 |
|                 |  Namespace: default                           |                 |
|                 |  SAN Domains:                                 |                 |
|                 |    1. mahesh.concretecrackgallery.online      |                 |
|                 |    2. maheshconcretegallery.online            |                 |
|                 +-----------------------+-----------------------+                 |
|                                         |                                         |
|                           GKE Ingress (GCE Load Balancer)                         |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     4. KUBERNETES BACKEND SERVICE ROUTING                         |
|                                                                                   |
|   1. AWS Host: mahesh.concretecrackgallery.online                                 |
|   ├── /         ──► Gallery Svc (:8082)                                           |
|   ├── /upload   ──► Upload Svc (:8080)                                            |
|   └── /uploaded ──► Upload Svc (:8080)                                            |
|                                                                                   |
|   2. GCP Host: maheshconcretegallery.online                                       |
|   ├── /         ──► Gallery Svc (:8082)                                           |
|   ├── /upload   ──► Upload Svc (:8080)                                            |
|   └── /uploaded ──► Upload Svc (:8080)                                            |
+-----------------------------------------------------------------------------------+
```

---

## 3. Kubernetes Manifest Specifications

### A. ManagedCertificate Manifest (`managedcertificate.yaml`)
```yaml
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: concrete-gallery-cert
  namespace: default
spec:
  domains:
    - mahesh.concretecrackgallery.online
    - maheshconcretegallery.online
```

### B. Ingress Manifest (`ingress.yaml`)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: concrete-gallery-ingress
  namespace: default
  annotations:
    kubernetes.io/ingress.class: "gce"
    networking.gke.io/managed-certificates: "concrete-gallery-cert"
    kubernetes.io/ingress.global-static-ip-name: "concrete-detection-ip"
spec:
  ingressClassName: "gce"
  rules:
    # 1. AWS Route 53 Domain
    - host: mahesh.concretecrackgallery.online
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: concrete-image-gallery-svc-lb
                port:
                  number: 8082
          - path: /upload
            pathType: Prefix
            backend:
              service:
                name: image-upload-svc-lb
                port:
                  number: 8080
          - path: /uploaded
            pathType: Prefix
            backend:
              service:
                name: image-upload-svc-lb
                port:
                  number: 8080

    # 2. GCP Domain
    - host: maheshconcretegallery.online
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: concrete-image-gallery-svc-lb
                port:
                  number: 8082
          - path: /upload
            pathType: Prefix
            backend:
              service:
                name: image-upload-svc-lb
                port:
                  number: 8080
          - path: /uploaded
            pathType: Prefix
            backend:
              service:
                name: image-upload-svc-lb
                port:
                  number: 8080
```

---

## 4. Verification & Validation Checklist

1. **Verify Git Branch**:
   ```bash
   git branch
   # Should output: * feature/aws-domain-multi-domain-ingress
   ```

2. **Verify Helm Chart Template Rendering**:
   ```bash
   helm template master-chart ./masterChart -f ./masterChart/values-gcp.yaml
   ```

3. **Verify Ingress & ManagedCertificate Status in GKE Cluster**:
   ```bash
   kubectl get ingress concrete-gallery-ingress -n default
   kubectl describe managedcertificate concrete-gallery-cert -n default
   ```

4. **Verify DNS Resolution for Both Domains**:
   ```bash
   nslookup mahesh.concretecrackgallery.online
   nslookup maheshconcretegallery.online
   ```
   *Both commands resolve to the exact same Ingress IP (`34.xxx.xxx.xxx`).*

5. **Verify Endpoint Accessibility over HTTPS**:
   - `https://mahesh.concretecrackgallery.online/`
   - `https://maheshconcretegallery.online/`
   - `https://mahesh.concretecrackgallery.online/upload`
   - `https://maheshconcretegallery.online/upload`
