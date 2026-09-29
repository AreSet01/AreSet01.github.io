---
title: "UE5 反射系统与底层架构深度解析（番外）：从代码简要解析generated.h，gen.cpp文件"
description: "从代码层面解析 Unreal Header Tool（UHT）生成的 .generated.h 和 .gen.cpp 文件，深入理解虚幻引擎反射系统的底层原理与设计哲学。"
pubDate: 2026-09-29
tags: ["Unreal Engine", "UE5", "UHT", "反射系统", "C++", "底层原理"]
category: "引擎开发"
series: "UE5 反射系统与底层架构深度解析"
seriesOrder: 6
draft: false
---

## 前言



---

## 源代码

### 1.Dream_GameModeBase.h

```cpp 
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Dream_GameModeBase.generated.h"

UCLASS()
class DREAM_API ADreamGameModeBase : public AGameModeBase
{
	GENERATED_BODY()
	
public:
	ADreamGameModeBase();
};
```

### 2.Dream_GameModeBase.cpp

```cpp 
#include "Core/Dream_GameModeBase.h"
#include "Core/Dream_PlanePawn.h"
#include "Core/Dream_PlayerController.h"
ADreamGameModeBase::ADreamGameModeBase()
{
	PlayerControllerClass = ADreamPlayerController::StaticClass();

	DefaultPawnClass = ADreamPlanePawn::StaticClass();
}
```

## UHT生成代码

### 1.Dream_GameModeBase.generated.h

```cpp
#ifdef DREAM_Dream_GameModeBase_generated_h
#error "Dream_GameModeBase.generated.h already included, missing '#pragma once' in Dream_GameModeBase.h"
#endif
#define DREAM_Dream_GameModeBase_generated_h

#include "UObject/ObjectMacros.h"
#include "UObject/ScriptMacros.h"

// 防止编译器对过时、废弃的代码（api）发出警告
// 虚幻UBT对所有警告都默认报错中断
PRAGMA_DISABLE_DEPRECATION_WARNINGS

// Begin Class ADreamGameModeBase
struct Z_Construct_UClass_ADreamGameModeBase_Statics;

// 项目专属宏，游戏逻辑会被编译成UnrealEditor-Dream.dll
// 自我编译时，展开为__declspec(dllexport)(向外导出，公开给别人用)
// 被引用编译时，__declspec(dllimport)(从别的DLL导入)
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister();

#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_INCLASS_NO_PURE_DECLS \
private: \
	static void StaticRegisterNativesADreamGameModeBase(); \
	friend struct ::Z_Construct_UClass_ADreamGameModeBase_Statics; \
	static UClass* GetPrivateStaticClass(); \
	friend DREAM_API UClass* ::Z_Construct_UClass_ADreamGameModeBase_NoRegister(); \
public: \
	DECLARE_CLASS2(ADreamGameModeBase, AGameModeBase, COMPILED_IN_FLAGS(0 | CLASS_Transient | CLASS_Config), CASTCLASS_None, TEXT("/Script/Dream"), Z_Construct_UClass_ADreamGameModeBase_NoRegister) \
	DECLARE_SERIALIZER(ADreamGameModeBase)


#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_ENHANCED_CONSTRUCTORS \
	/** Deleted move- and copy-constructors, should never be used */ \
	ADreamGameModeBase(ADreamGameModeBase&&) = delete; \
	ADreamGameModeBase(const ADreamGameModeBase&) = delete; \
	DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, ADreamGameModeBase); \
	DEFINE_VTABLE_PTR_HELPER_CTOR_CALLER(ADreamGameModeBase); \
	DEFINE_DEFAULT_CONSTRUCTOR_CALL(ADreamGameModeBase) \
	NO_API virtual ~ADreamGameModeBase();


#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_12_PROLOG
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_GENERATED_BODY \
PRAGMA_DISABLE_DEPRECATION_WARNINGS \
public: \
	FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_INCLASS_NO_PURE_DECLS \
	FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_ENHANCED_CONSTRUCTORS \
private: \
PRAGMA_ENABLE_DEPRECATION_WARNINGS


class ADreamGameModeBase;

// ********** End Class ADreamGameModeBase *********************************************************

#undef CURRENT_FILE_ID
#define CURRENT_FILE_ID FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h

PRAGMA_ENABLE_DEPRECATION_WARNINGS

```

### 2.Dream_GameModeBase.gen.cpp

```cpp

#include "UObject/GeneratedCppIncludes.h"
#include "Core/Dream_GameModeBase.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS
static_assert(!UE_WITH_CONSTINIT_UOBJECT, "This generated code can only be compiled with !UE_WITH_CONSTINIT_OBJECT");
void EmptyLinkFunctionForGeneratedCodeDream_GameModeBase() {}

// Begin Cross Module References 
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase();
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister();
ENGINE_API UClass* Z_Construct_UClass_AGameModeBase();
UPackage* Z_Construct_UPackage__Script_Dream();
// End Cross Module References 

// Begin Class ADreamGameModeBase 
FClassRegistrationInfo Z_Registration_Info_UClass_ADreamGameModeBase;
UClass* ADreamGameModeBase::GetPrivateStaticClass()
{
	using TClass = ADreamGameModeBase;
	if (!Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton)
	{
		GetPrivateStaticClassBody(
			TClass::StaticPackage(),
			TEXT("DreamGameModeBase"),
			Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton,
			StaticRegisterNativesADreamGameModeBase,
			sizeof(TClass),
			alignof(TClass),
			TClass::StaticClassFlags,
			TClass::StaticClassCastFlags(),
			TClass::StaticConfigName(),
			(UClass::ClassConstructorType)InternalConstructor<TClass>,
			(UClass::ClassVTableHelperCtorCallerType)InternalVTableHelperCtorCaller<TClass>,
			UOBJECT_CPPCLASS_STATICFUNCTIONS_FORCLASS(TClass),
			&TClass::Super::StaticClass,
			&TClass::WithinClass::StaticClass
		);
	}
	return Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton;
}
UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister()
{
	return ADreamGameModeBase::GetPrivateStaticClass();
}
struct Z_Construct_UClass_ADreamGameModeBase_Statics
{
    // 编辑器元数据键值对(Class_MetaDataParams[])
    // 让Uereal Editor在编辑器中显示类的相关信息(隐藏属性面板HideCategories，头文件路径，依赖路径)
    // 打包时会被剥离掉(WITH_METADATA)省内存
#if WITH_METADATA
	static constexpr UECodeGen_Private::FMetaDataPairParam Class_MetaDataParams[] = {
#if !UE_BUILD_SHIPPING
		{ "Comment", "/**\n * \n */" },
#endif
		{ "HideCategories", "Info Rendering MovementReplication Replication Actor Input Movement Collision Rendering HLOD WorldPartition DataLayers Transformation" },
		{ "IncludePath", "Core/Dream_GameModeBase.h" },
		{ "ModuleRelativePath", "Public/Core/Dream_GameModeBase.h" },
		{ "ShowCategories", "Input|MouseInput Input|TouchInput" },
	};
#endif // WITH_METADATA

// Begin Class ADreamGameModeBase constinit property declarations 

// End Class ADreamGameModeBase constinit property declarations 
	static UObject* (*const DependentSingletons[])();

    // 记录这个类在 C++ 层面是不是一个纯虚抽象类
    // True，蓝图和引擎禁止直接实例化
	static constexpr FCppClassTypeInfoStatic StaticCppClassTypeInfo = {
		TCppClassTypeTraits<ADreamGameModeBase>::IsAbstract,
	};

    // 将信息汇总+ClassFlags标志位(0x009002ACu)传递给ConstructUClass
	static const UECodeGen_Private::FClassParams ClassParams;
}; // struct Z_Construct_UClass_ADreamGameModeBase_Statics

// 函数指针，指向依赖的单例对象(父类和模块包)，用于在运行时获取这些对象的引用
UObject* (*const Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons[])() = {
    // 父类(AGameModeBase)
	(UObject* (*)())Z_Construct_UClass_AGameModeBase,
	// 所属模块包(Package)，虚拟对象路径(/Script/Dream)
    // Script：Ue顶级挂载点，用于存放所有C++原生代码编译出来的类、结构体和枚举
    // Dream：模块名
    (UObject* (*)())Z_Construct_UPackage__Script_Dream,
    // 内存中完整的对象路径：/Script/Dream.DreamGameModeBase
};
static_assert(UE_ARRAY_COUNT(Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons) < 16);
const UECodeGen_Private::FClassParams Z_Construct_UClass_ADreamGameModeBase_Statics::ClassParams = {
	&ADreamGameModeBase::StaticClass,
	"Game",
	&StaticCppClassTypeInfo,
	DependentSingletons,
	nullptr,
	nullptr,
	nullptr,
	UE_ARRAY_COUNT(DependentSingletons),
	0,
	0,
	0,
	0x009002ACu,
	METADATA_PARAMS(UE_ARRAY_COUNT(Z_Construct_UClass_ADreamGameModeBase_Statics::Class_MetaDataParams), Z_Construct_UClass_ADreamGameModeBase_Statics::Class_MetaDataParams)
};
void ADreamGameModeBase::StaticRegisterNativesADreamGameModeBase()
{
}
UClass* Z_Construct_UClass_ADreamGameModeBase()
{
	if (!Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton)
	{
		UECodeGen_Private::ConstructUClass(Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton, Z_Construct_UClass_ADreamGameModeBase_Statics::ClassParams);
	}
	return Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton;
}
DEFINE_VTABLE_PTR_HELPER_CTOR_NS(, ADreamGameModeBase);
ADreamGameModeBase::~ADreamGameModeBase() {}
// ********** End Class ADreamGameModeBase *********************************************************

// ********** Begin Registration *******************************************************************
struct Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics
{
	static constexpr FClassRegisterCompiledInInfo ClassInfo[] = {
		{ Z_Construct_UClass_ADreamGameModeBase, ADreamGameModeBase::StaticClass, TEXT("ADreamGameModeBase"), &Z_Registration_Info_UClass_ADreamGameModeBase, CONSTRUCT_RELOAD_VERSION_INFO(FClassReloadVersionInfo, sizeof(ADreamGameModeBase), 2001584642U) },
	};
}; // Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics 
static FRegisterCompiledInInfo Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_2698426432{
	TEXT("/Script/Dream"),
	Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics::ClassInfo, UE_ARRAY_COUNT(Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics::ClassInfo),
	nullptr, 0,
	nullptr, 0,
};
// ********** End Registration *********************************************************************

PRAGMA_ENABLE_DEPRECATION_WARNINGS

```